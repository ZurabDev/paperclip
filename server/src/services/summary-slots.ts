import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  documentRevisions,
  documents,
  issues,
  projectWorkspaces,
  projects,
  summarySlots,
} from "@paperclipai/db";
import {
  type GenerateSummarySlotResponse,
  type GetSummarySlotResponse,
  type IssueStatus,
  type ListSummarySlotRevisionsResponse,
  type SummarySlot,
  type SummarySlotDocument,
  type SummarySlotIssueRef,
  type SummarySlotRevision,
  type SummarySlotScopeKind,
  type SummarySlotScopeSelector,
  summarySlotScopeSelectorSchema,
  type WriteSummarySlotResponse,
} from "@paperclipai/shared";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { readBuiltInAgentMarker } from "./built-in-agent-metadata.js";
import { builtInAgentService } from "./built-in-agents.js";
import { agentService } from "./agents.js";
import { issueService } from "./issues.js";

/** Built-in agent key for the Summarizer bundle (see PAP-13920). */
export const SUMMARIZER_BUILT_IN_KEY = "summarizer";

/** Generation issues in these statuses are no longer active and can be superseded. */
const TERMINAL_ISSUE_STATUSES = new Set<IssueStatus>(["done", "cancelled"]);

const DEFAULT_SUMMARY_FORMAT = "markdown";
const SUMMARY_SLOT_REVISION_LIMIT = 20;
const SUMMARY_SNAPSHOT_GROUP_LIMIT = 12;
const SUMMARY_SNAPSHOT_INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1_000;

export interface SummarySlotSelectorInput {
  companyId: string;
  scopeKind: string;
  slotKey: string;
  scopeId?: string | null;
}

export interface SummaryGenerateActor {
  agentId?: string | null;
  userId?: string | null;
  runId?: string | null;
}

export interface SummaryWriteActor {
  agentId?: string | null;
  runId?: string | null;
}

type ResolvedSelector = SummarySlotScopeSelector & {
  companyId: string;
  scopeId: string | null;
};

type SummarySlotRow = typeof summarySlots.$inferSelect;

function mapSlot(row: SummarySlotRow): SummarySlot {
  return {
    id: row.id,
    companyId: row.companyId,
    scopeKind: row.scopeKind,
    scopeId: row.scopeId ?? null,
    slotKey: row.slotKey,
    documentId: row.documentId ?? null,
    status: row.status,
    failureReason: row.failureReason ?? null,
    generatingIssueId: row.generatingIssueId ?? null,
    lastGeneratedAt: row.lastGeneratedAt ?? null,
    lastGeneratedByAgentId: row.lastGeneratedByAgentId ?? null,
    lastModel: row.lastModel ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDocument(row: typeof documents.$inferSelect): SummarySlotDocument {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title ?? null,
    format: row.format as SummarySlotDocument["format"],
    body: row.latestBody,
    latestRevisionId: row.latestRevisionId ?? null,
    latestRevisionNumber: row.latestRevisionNumber,
    createdByAgentId: row.createdByAgentId ?? null,
    createdByUserId: row.createdByUserId ?? null,
    updatedByAgentId: row.updatedByAgentId ?? null,
    updatedByUserId: row.updatedByUserId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRevision(row: typeof documentRevisions.$inferSelect): SummarySlotRevision {
  return {
    id: row.id,
    companyId: row.companyId,
    documentId: row.documentId,
    revisionNumber: row.revisionNumber,
    title: row.title ?? null,
    format: row.format as SummarySlotRevision["format"],
    body: row.body,
    changeSummary: row.changeSummary ?? null,
    createdByAgentId: row.createdByAgentId ?? null,
    createdByUserId: row.createdByUserId ?? null,
    createdByRunId: row.createdByRunId ?? null,
    createdAt: row.createdAt,
  };
}

function scopeLabel(scopeKind: SummarySlotScopeKind): string {
  switch (scopeKind) {
    case "project":
      return "проекта";
    case "project_workspace":
      return "рабочей среды";
    case "workspaces_overview":
      return "обзора рабочих сред";
    default:
      return "выбранной области";
  }
}

export function summarySlotService(db: Db) {
  const builtIns = builtInAgentService(db);
  const agents = agentService(db);
  const issuesSvc = issueService(db);

  function resolveSelector(input: SummarySlotSelectorInput): ResolvedSelector {
    const parsed = summarySlotScopeSelectorSchema.safeParse({
      scopeKind: input.scopeKind,
      slotKey: input.slotKey,
      scopeId: input.scopeId ?? undefined,
    });
    if (!parsed.success) {
      throw unprocessable("Недопустимый выбор слота сводки", parsed.error.issues);
    }
    return {
      ...parsed.data,
      companyId: input.companyId,
      scopeId: parsed.data.scopeId ?? null,
    };
  }

  /** Enforce that the scope target exists inside the company boundary. */
  async function assertTargetVisible(sel: ResolvedSelector): Promise<void> {
    if (sel.scopeKind === "workspaces_overview") return;
    if (!sel.scopeId) {
      // Guaranteed by the selector schema, but keep the invariant explicit.
      throw unprocessable(`Для слотов сводки типа ${sel.scopeKind} требуется scopeId`);
    }
    if (sel.scopeKind === "project") {
      const row = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, sel.scopeId), eq(projects.companyId, sel.companyId)))
        .then((rows) => rows[0] ?? null);
      if (!row) throw notFound("Область для сводки не найдена");
      return;
    }
    if (sel.scopeKind === "project_workspace") {
      const row = await db
        .select({ id: projectWorkspaces.id })
        .from(projectWorkspaces)
        .where(and(eq(projectWorkspaces.id, sel.scopeId), eq(projectWorkspaces.companyId, sel.companyId)))
        .then((rows) => rows[0] ?? null);
      if (!row) throw notFound("Область для сводки не найдена");
    }
  }

  function findSlotRow(sel: ResolvedSelector) {
    return db
      .select()
      .from(summarySlots)
      .where(
        and(
          eq(summarySlots.companyId, sel.companyId),
          eq(summarySlots.scopeKind, sel.scopeKind),
          eq(summarySlots.slotKey, sel.slotKey),
          sel.scopeId === null ? isNull(summarySlots.scopeId) : eq(summarySlots.scopeId, sel.scopeId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  async function loadDocument(companyId: string, documentId: string | null) {
    if (!documentId) return null;
    return db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
  }

  async function loadIssueRef(companyId: string, issueId: string | null): Promise<{
    ref: SummarySlotIssueRef | null;
    row: typeof issues.$inferSelect | null;
  }> {
    if (!issueId) return { ref: null, row: null };
    const row = await db
      .select()
      .from(issues)
      .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!row) return { ref: null, row: null };
    return {
      row,
      ref: {
        id: row.id,
        identifier: row.identifier ?? null,
        title: row.title,
        status: row.status as IssueStatus,
        assigneeAgentId: row.assigneeAgentId ?? null,
      },
    };
  }

  function isIssueActive(row: typeof issues.$inferSelect | null): boolean {
    return !!row && !TERMINAL_ISSUE_STATUSES.has(row.status as IssueStatus);
  }

  async function getSlot(input: SummarySlotSelectorInput): Promise<GetSummarySlotResponse> {
    const sel = resolveSelector(input);
    await assertTargetVisible(sel);
    const slotRow = await findSlotRow(sel);
    if (!slotRow) return { slot: null, document: null, generatingIssue: null };
    const [documentRow, issueRef] = await Promise.all([
      loadDocument(sel.companyId, slotRow.documentId ?? null),
      loadIssueRef(sel.companyId, slotRow.generatingIssueId ?? null),
    ]);
    return {
      slot: mapSlot(slotRow),
      document: documentRow ? mapDocument(documentRow) : null,
      generatingIssue: issueRef.ref,
    };
  }

  async function listRevisions(input: SummarySlotSelectorInput): Promise<ListSummarySlotRevisionsResponse> {
    const sel = resolveSelector(input);
    await assertTargetVisible(sel);
    const slotRow = await findSlotRow(sel);
    if (!slotRow || !slotRow.documentId) {
      return { slot: slotRow ? mapSlot(slotRow) : null, revisions: [] };
    }
    const revisions = await db
      .select()
      .from(documentRevisions)
      .where(
        and(
          eq(documentRevisions.documentId, slotRow.documentId),
          eq(documentRevisions.companyId, sel.companyId),
        ),
      )
      .orderBy(desc(documentRevisions.revisionNumber))
      .limit(SUMMARY_SLOT_REVISION_LIMIT);
    return { slot: mapSlot(slotRow), revisions: revisions.map(mapRevision) };
  }

  async function upsertSlot(
    sel: ResolvedSelector,
    patch: Partial<typeof summarySlots.$inferInsert>,
  ): Promise<SummarySlotRow> {
    const now = new Date();
    const [slot] = await db
      .insert(summarySlots)
      .values({
        companyId: sel.companyId,
        scopeKind: sel.scopeKind,
        scopeId: sel.scopeId,
        slotKey: sel.slotKey,
        status: "idle",
        createdAt: now,
        updatedAt: now,
        ...patch,
      })
      .onConflictDoUpdate({
        target: [
          summarySlots.companyId,
          summarySlots.scopeKind,
          summarySlots.scopeId,
          summarySlots.slotKey,
        ],
        set: { ...patch, updatedAt: now },
      })
      .returning();
    return slot;
  }

  async function resolveGenerationTargetProject(sel: ResolvedSelector): Promise<{
    projectId: string | null;
    projectWorkspaceId: string | null;
  }> {
    if (sel.scopeKind === "project") {
      return { projectId: sel.scopeId, projectWorkspaceId: null };
    }
    if (sel.scopeKind === "project_workspace" && sel.scopeId) {
      const row = await db
        .select({ projectId: projectWorkspaces.projectId })
        .from(projectWorkspaces)
        .where(and(eq(projectWorkspaces.id, sel.scopeId), eq(projectWorkspaces.companyId, sel.companyId)))
        .then((rows) => rows[0] ?? null);
      return { projectId: row?.projectId ?? null, projectWorkspaceId: sel.scopeId };
    }
    return { projectId: null, projectWorkspaceId: null };
  }

  function scopeIssueConditions(sel: ResolvedSelector) {
    if (sel.scopeKind === "project") return [eq(issues.projectId, sel.scopeId!)];
    if (sel.scopeKind === "project_workspace") return [eq(issues.projectWorkspaceId, sel.scopeId!)];
    return [];
  }

  async function buildScopeSnapshot(sel: ResolvedSelector, previousGeneratedAt: Date | null): Promise<string> {
    const commonConditions = [
      eq(issues.companyId, sel.companyId),
      isNull(issues.hiddenAt),
      ...scopeIssueConditions(sel),
    ];
    const recentlyDoneSince = previousGeneratedAt
      ?? new Date(Date.now() - SUMMARY_SNAPSHOT_INITIAL_LOOKBACK_MS);
    const selectFields = {
      identifier: issues.identifier,
      title: issues.title,
      status: issues.status,
      priority: issues.priority,
      updatedAt: issues.updatedAt,
    };

    const [blocked, inReview, inProgress, recentlyDone] = await Promise.all([
      db.select(selectFields).from(issues)
        .where(and(...commonConditions, eq(issues.status, "blocked")))
        .orderBy(desc(issues.updatedAt)).limit(SUMMARY_SNAPSHOT_GROUP_LIMIT),
      db.select(selectFields).from(issues)
        .where(and(...commonConditions, eq(issues.status, "in_review")))
        .orderBy(desc(issues.updatedAt)).limit(SUMMARY_SNAPSHOT_GROUP_LIMIT),
      db.select(selectFields).from(issues)
        .where(and(...commonConditions, eq(issues.status, "in_progress")))
        .orderBy(desc(issues.updatedAt)).limit(SUMMARY_SNAPSHOT_GROUP_LIMIT),
      db.select(selectFields).from(issues)
        .where(and(
          ...commonConditions,
          inArray(issues.status, ["done"]),
          gte(issues.updatedAt, recentlyDoneSince),
        ))
        .orderBy(desc(issues.updatedAt)).limit(SUMMARY_SNAPSHOT_GROUP_LIMIT),
    ]);

    const formatGroup = (
      heading: string,
      rows: Array<typeof blocked[number]>,
    ) => [
      `### ${heading}`,
      ...(rows.length > 0
        ? rows.map((row) => {
            const identifier = row.identifier ?? "Задача без номера";
            const companyPrefix = row.identifier?.split("-", 1)[0];
            const issueLink = companyPrefix
              ? `[${identifier}](/${companyPrefix}/issues/${identifier})`
              : identifier;
            return `- ${issueLink} — ${row.title} (${row.priority}; обновлено ${row.updatedAt.toISOString()})`;
          })
        : ["- Нет."]),
    ];

    return [
      "## Подготовленный снимок области",
      "",
      `Снимок создан ${new Date().toISOString()}. Недавно завершёнными считаются задачи, обновлённые после ${recentlyDoneSince.toISOString()}.`,
      "Используйте этот ограниченный рамками компании снимок как единственный источник сведений о задачах для текущего запуска. Не вызывайте конечные точки списка задач.",
      "",
      ...formatGroup("Заблокировано", blocked),
      "",
      ...formatGroup("На проверке", inReview),
      "",
      ...formatGroup("В работе", inProgress),
      "",
      ...formatGroup("Недавно завершено", recentlyDone),
    ].join("\n");
  }

  function generationIssueDescription(
    sel: ResolvedSelector,
    scopeSnapshot: string,
    generationIssueId: string | null = null,
  ): string {
    const target = sel.scopeId ? `\`${sel.scopeId}\`` : "обзор рабочих сред";
    const summarySlotPath = `/api/companies/${encodeURIComponent(sel.companyId)}/summary-slots/${encodeURIComponent(sel.scopeKind)}/${encodeURIComponent(sel.slotKey)}`;
    const scopeQuery = sel.scopeId ? `?scopeId=${encodeURIComponent(sel.scopeId)}` : "";
    return [
      `Создайте сводку ${scopeLabel(sel.scopeKind)} для ${target}.`,
      "",
      "Вызовите `/summarize-status`. Полные формы запросов приведены в кратком справочнике API этого навыка; для текущего запуска используйте следующие готовые маршруты:",
      "",
      `- Прочитать текущий слот: \`GET ${summarySlotPath}${scopeQuery}\``,
      `- Записать версию: \`PUT ${summarySlotPath}\``,
      "",
      "Используйте следующие данные записи:",
      "",
      "```json",
      JSON.stringify(
        {
          scopeKind: sel.scopeKind,
          scopeId: sel.scopeId,
          slotKey: sel.slotKey,
          generationIssueId,
        },
        null,
        2,
      ),
      "```",
      "",
      "Напишите одну короткую понятную Markdown-сводку. Начните с 1–3 конкретных выполнимых действий, которые читателю нужно сделать сейчас для разблокировки работы: для каждого укажите действие, причину задержки и встроенную ссылку. Затем кратко опишите текущее положение простым языком. Самостоятельно прочитайте необходимые задачи и сосредоточьтесь на самом важном. Пишите для читателя, который не помнит идентификаторы задач и обсуждения. Если от читателя действительно ничего не требуется, прямо скажите об этом одной строкой и назовите следующий важный сигнал. Не добавляйте в конце перечень задач или набор ссылок.",
      "Ответ текущего слота содержит последнее тело документа и `latestRevisionId`; используйте их напрямую.",
      "Следуйте потоковому протоколу навыка: немедленно, до анализа, отправьте первую строку `STATUS:` с названием первой задачи из снимка; продолжайте отправлять строки `STATUS:` во время работы и перед окончательной записью слота выведите черновик сводки между служебными маркерами.",
      "Передайте в API записи слота `generationIssueId` из данных задания, идентификатор предыдущей версии при его наличии и фактически использованную модель.",
      "",
      scopeSnapshot,
      "",
      "После записи новой версии сводки завершите задачу коротким комментарием.",
    ].join("\n");
  }

  function generationIssueTitle(sel: ResolvedSelector, createdAt = new Date()): string {
    const timestamp = createdAt.toISOString().replace("T", " ").replace(/:\d{2}\.\d{3}Z$/, " UTC");
    return `Сводка ${scopeLabel(sel.scopeKind)} на ${timestamp}`;
  }

  async function generate(
    input: SummarySlotSelectorInput,
    actor: SummaryGenerateActor,
  ): Promise<GenerateSummarySlotResponse> {
    const sel = resolveSelector(input);
    await assertTargetVisible(sel);

    const builtIn = await builtIns.get(sel.companyId, SUMMARIZER_BUILT_IN_KEY);
    if (builtIn.status !== "ready" || !builtIn.agentId) {
      throw unprocessable("Встроенный Агент сводок не настроен", {
        code: "summarizer_not_configured",
        status: builtIn.status,
      });
    }
    const summarizerAgentId = builtIn.agentId;

    // Dedupe: if a generation is already active, return the in-flight state.
    const existing = await findSlotRow(sel);
    if (existing && existing.status === "generating" && existing.generatingIssueId) {
      const active = await loadIssueRef(sel.companyId, existing.generatingIssueId);
      if (isIssueActive(active.row)) {
        return {
          slot: mapSlot(existing),
          generatingIssue: active.ref!,
          alreadyGenerating: true,
        };
      }
    }

    const { projectId, projectWorkspaceId } = await resolveGenerationTargetProject(sel);
    const scopeSnapshot = await buildScopeSnapshot(sel, existing?.lastGeneratedAt ?? null);
    const createdAt = new Date();
    const generationVersion = existing?.generatingIssueId ?? existing?.updatedAt.toISOString() ?? "initial";
    let issueDeduplicated = false;
    const created = await issuesSvc.create(sel.companyId, {
      projectId,
      projectWorkspaceId,
      title: generationIssueTitle(sel, createdAt),
      description: generationIssueDescription(sel, scopeSnapshot),
      status: "todo",
      priority: "medium",
      assigneeAgentId: summarizerAgentId,
      createdByAgentId: actor.agentId ?? null,
      createdByUserId: actor.userId ?? null,
      hiddenAt: createdAt,
      idempotencyKey: [
        "summary-slot-generation",
        sel.scopeKind,
        sel.scopeId ?? "global",
        sel.slotKey,
        generationVersion,
      ].join(":"),
      onDeduplicated: (reason) => {
        issueDeduplicated = reason === "idempotency_key";
      },
    });
    const generationIssue = (
      await issuesSvc.update(created.id, {
        description: generationIssueDescription(sel, scopeSnapshot, created.id),
      })
    ) ?? created;

    const slotRow = await upsertSlot(sel, {
      status: "generating",
      failureReason: null,
      generatingIssueId: generationIssue.id,
    });

    return {
      slot: mapSlot(slotRow),
      generatingIssue: {
        id: generationIssue.id,
        identifier: generationIssue.identifier ?? null,
        title: generationIssue.title,
        status: generationIssue.status as IssueStatus,
        assigneeAgentId: generationIssue.assigneeAgentId ?? null,
      },
      alreadyGenerating: issueDeduplicated,
    };
  }

  async function assertSummarizerWriter(
    sel: ResolvedSelector,
    slotRow: SummarySlotRow | null,
    input: { generationIssueId?: string | null },
    actor: SummaryWriteActor,
  ): Promise<void> {
    if (!actor.agentId) {
      throw forbidden("Записывать сводки может только встроенный Агент сводок");
    }
    const agent = await agents.getById(actor.agentId);
    if (!agent || agent.companyId !== sel.companyId) {
      throw forbidden("Записывать сводки может только встроенный Агент сводок");
    }
    const marker = readBuiltInAgentMarker(agent.metadata);
    if (marker?.key !== SUMMARIZER_BUILT_IN_KEY) {
      throw forbidden("Записывать сводки может только встроенный Агент сводок");
    }

    // The write must originate from the linked, in-flight generation task.
    const generationIssueId = input.generationIssueId ?? null;
    if (!generationIssueId) {
      throw forbidden("При записи сводки необходимо указать активную задачу создания");
    }
    if (!slotRow?.generatingIssueId || slotRow.generatingIssueId !== generationIssueId) {
      throw forbidden("Запись сводки не соответствует активной задаче создания");
    }
    const issueRef = await loadIssueRef(sel.companyId, generationIssueId);
    if (!issueRef.row) {
      throw forbidden("Связанная задача создания не найдена");
    }
    const payloadMatch = issueRef.row.description?.match(/```json\n([\s\S]*?)\n```/);
    let payload: Record<string, unknown> | null = null;
    try {
      payload = payloadMatch ? (JSON.parse(payloadMatch[1]) as Record<string, unknown>) : null;
    } catch {
      payload = null;
    }
    if (
      payload?.generationIssueId !== generationIssueId ||
      payload.scopeKind !== sel.scopeKind ||
      (payload.scopeId ?? null) !== sel.scopeId ||
      payload.slotKey !== sel.slotKey
    ) {
      throw forbidden("Задача создания не относится к этому слоту сводки");
    }
    if (issueRef.row.assigneeAgentId !== actor.agentId) {
      throw forbidden("Задача создания не назначена этому агенту");
    }
    const runId = actor.runId ?? null;
    const runMatches =
      !!runId && (issueRef.row.checkoutRunId === runId || issueRef.row.executionRunId === runId);
    if (!runMatches) {
      throw forbidden("Запись сводки должна выполняться из связанной задачи создания");
    }
  }

  async function write(
    input: SummarySlotSelectorInput & {
      markdown: string;
      title?: string | null;
      changeSummary?: string | null;
      baseRevisionId?: string | null;
      generationIssueId?: string | null;
      model?: string | null;
    },
    actor: SummaryWriteActor,
  ): Promise<WriteSummarySlotResponse> {
    const sel = resolveSelector(input);
    await assertTargetVisible(sel);
    const slotRow = await findSlotRow(sel);
    await assertSummarizerWriter(sel, slotRow, input, actor);

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const currentSlot = slotRow
        ? await tx
            .select()
            .from(summarySlots)
            .where(eq(summarySlots.id, slotRow.id))
            .then((rows) => rows[0] ?? null)
        : null;
      if (!currentSlot || currentSlot.generatingIssueId !== input.generationIssueId) {
        throw conflict("Summary generation was superseded by a newer task");
      }

      let documentRow: typeof documents.$inferSelect;
      let revisionRow: typeof documentRevisions.$inferSelect;

      const existingDocument = currentSlot?.documentId
        ? await tx
            .select()
            .from(documents)
            .where(and(eq(documents.id, currentSlot.documentId), eq(documents.companyId, sel.companyId)))
            .then((rows) => rows[0] ?? null)
        : null;

      if (existingDocument) {
        if (input.baseRevisionId && input.baseRevisionId !== existingDocument.latestRevisionId) {
          throw conflict("Summary was updated by someone else", {
            currentRevisionId: existingDocument.latestRevisionId,
          });
        }
        const nextRevisionNumber = existingDocument.latestRevisionNumber + 1;
        [revisionRow] = await tx
          .insert(documentRevisions)
          .values({
            companyId: sel.companyId,
            documentId: existingDocument.id,
            revisionNumber: nextRevisionNumber,
            title: input.title ?? null,
            format: DEFAULT_SUMMARY_FORMAT,
            body: input.markdown,
            changeSummary: input.changeSummary ?? null,
            createdByAgentId: actor.agentId ?? null,
            createdByRunId: actor.runId ?? null,
            createdAt: now,
          })
          .returning();
        [documentRow] = await tx
          .update(documents)
          .set({
            title: input.title ?? null,
            format: DEFAULT_SUMMARY_FORMAT,
            latestBody: input.markdown,
            latestRevisionId: revisionRow.id,
            latestRevisionNumber: nextRevisionNumber,
            updatedByAgentId: actor.agentId ?? null,
            updatedAt: now,
          })
          .where(eq(documents.id, existingDocument.id))
          .returning();
      } else {
        [documentRow] = await tx
          .insert(documents)
          .values({
            companyId: sel.companyId,
            title: input.title ?? null,
            format: DEFAULT_SUMMARY_FORMAT,
            latestBody: input.markdown,
            latestRevisionId: null,
            latestRevisionNumber: 1,
            createdByAgentId: actor.agentId ?? null,
            updatedByAgentId: actor.agentId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        [revisionRow] = await tx
          .insert(documentRevisions)
          .values({
            companyId: sel.companyId,
            documentId: documentRow.id,
            revisionNumber: 1,
            title: input.title ?? null,
            format: DEFAULT_SUMMARY_FORMAT,
            body: input.markdown,
            changeSummary: input.changeSummary ?? null,
            createdByAgentId: actor.agentId ?? null,
            createdByRunId: actor.runId ?? null,
            createdAt: now,
          })
          .returning();
        [documentRow] = await tx
          .update(documents)
          .set({ latestRevisionId: revisionRow.id })
          .where(eq(documents.id, documentRow.id))
          .returning();
      }

      const slotPatch = {
        documentId: documentRow.id,
        status: "idle" as const,
        failureReason: null,
        generatingIssueId: null,
        lastGeneratedAt: now,
        lastGeneratedByAgentId: actor.agentId ?? null,
        lastModel: input.model ?? null,
        updatedAt: now,
      };

      const [nextSlot] = await tx
        .update(summarySlots)
        .set(slotPatch)
        .where(
          and(
            eq(summarySlots.id, currentSlot.id),
            eq(summarySlots.generatingIssueId, input.generationIssueId!),
          ),
        )
        .returning();
      if (!nextSlot) {
        throw conflict("Summary generation was superseded by a newer task");
      }

      return { slot: nextSlot, document: documentRow, revision: revisionRow };
    });

    return {
      slot: mapSlot(result.slot),
      document: mapDocument(result.document),
      revision: mapRevision(result.revision),
    };
  }

  return {
    getSlot,
    listRevisions,
    generate,
    write,
  };
}
