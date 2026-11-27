import crypto from 'node:crypto';
import {
  parseModelHandle,
  type SecondOpinionColumn,
  type SecondOpinionRecord,
  type SecondOpinionResolveParams,
  type SecondOpinionStartParams,
  type TurnEventNotificationParams,
} from '@orchdeck/shared';
import type { TurnRunner } from '../adapters/turn-runner.js';
import type { GitService, WorkingTreeBaseline } from '../git/git-service.js';

export interface SecondOpinionOrchestratorOptions {
  readonly turnRunner: TurnRunner;
  readonly gitService: GitService;
  readonly emitUpdated: (secondOpinion: SecondOpinionRecord) => void;
}

interface InternalOpinionState {
  record: SecondOpinionRecord;
  baseline: WorkingTreeBaseline | null;
}

export class SecondOpinionOrchestrator {
  private readonly turnRunner: TurnRunner;
  private readonly gitService: GitService;
  private readonly emitUpdated: (secondOpinion: SecondOpinionRecord) => void;
  private readonly opinions = new Map<string, InternalOpinionState>();
  private readonly slotByTurnId = new Map<string, { readonly opinionId: string; readonly slot: 'A' | 'B' }>();
  private readonly unsubscribeEvents: () => void;

  constructor(options: SecondOpinionOrchestratorOptions) {
    this.turnRunner = options.turnRunner;
    this.gitService = options.gitService;
    this.emitUpdated = options.emitUpdated;
    this.unsubscribeEvents = this.turnRunner.subscribeEvents((notification) => {
      this.handleTurnEvent(notification);
    });
  }

  dispose(): void {
    this.unsubscribeEvents();
  }

  getOpinion(id: string): SecondOpinionRecord | null {
    return this.opinions.get(id)?.record ?? null;
  }

  private emitRecord(entry: InternalOpinionState, next: SecondOpinionRecord): SecondOpinionRecord {
    entry.record = next;
    this.emitUpdated(next);
    return next;
  }

  private handleTurnEvent(notification: TurnEventNotificationParams): void {
    const meta = this.slotByTurnId.get(notification.turnId);
    if (!meta) {
      return;
    }
    const entry = this.opinions.get(meta.opinionId);
    if (!entry) {
      this.slotByTurnId.delete(notification.turnId);
      return;
    }

    const { event } = notification;
    const colKey = meta.slot === 'A' ? 'columnA' : 'columnB';
    const currentCol = entry.record[colKey];

    if (event.type === 'text_delta') {
      const nextCol: SecondOpinionColumn = {
        ...currentCol,
        status: 'STREAMING',
        text: `${currentCol.text}${event.text}`,
      };
      this.emitRecord(entry, {
        ...entry.record,
        [colKey]: nextCol,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (event.type !== 'done') {
      return;
    }

    this.slotByTurnId.delete(notification.turnId);
    const colOutcome = event.outcome;
    const isOtherFinished =
      meta.slot === 'A'
        ? entry.record.columnB.status !== 'PENDING' && entry.record.columnB.status !== 'STREAMING'
        : entry.record.columnA.status !== 'PENDING' && entry.record.columnA.status !== 'STREAMING';

    if (isOtherFinished) {
      void this.finalizeOpinionTurn(entry, colKey, colOutcome);
      return;
    }

    const nextCol: SecondOpinionColumn = {
      ...currentCol,
      status: colOutcome === 'completed' ? 'COMPLETED' : 'FAILED',
      errorMessage:
        colOutcome === 'completed' ? null : `Second opinion turn ended with ${colOutcome}.`,
    };
    this.emitRecord(entry, {
      ...entry.record,
      [colKey]: nextCol,
      updatedAt: new Date().toISOString(),
    });
  }

  private async finalizeOpinionTurn(
    entry: InternalOpinionState,
    colKey: 'columnA' | 'columnB',
    outcome: 'completed' | 'cancelled' | 'rate_limited' | 'error',
  ): Promise<void> {
    let violated = false;
    if (entry.baseline && (await this.gitService.isGitRepository(entry.record.cwd))) {
      const guard = await this.gitService.verifyAndRevertReadOnlyTurn(
        entry.record.cwd,
        entry.baseline,
      );
      violated = guard.violated;
    }

    const currentCol = entry.record[colKey];
    const nextCol: SecondOpinionColumn = {
      ...currentCol,
      status: outcome === 'completed' ? 'COMPLETED' : 'FAILED',
      errorMessage:
        outcome === 'completed' ? null : `Second opinion turn ended with ${outcome}.`,
    };

    this.emitRecord(entry, {
      ...entry.record,
      [colKey]: nextCol,
      roleViolationDetected: entry.record.roleViolationDetected || violated,
      updatedAt: new Date().toISOString(),
    });
  }

  async startSecondOpinion(params: SecondOpinionStartParams): Promise<SecondOpinionRecord> {
    const parsedA = parseModelHandle(params.modelAHandle);
    const parsedB = parseModelHandle(params.modelBHandle);
    const turnIdA = crypto.randomUUID();
    const turnIdB = crypto.randomUUID();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const baseline = (await this.gitService.isGitRepository(params.cwd))
      ? await this.gitService.captureWorkingTreeBaseline(params.cwd)
      : null;

    const record: SecondOpinionRecord = {
      id,
      projectId: params.projectId,
      chatId: params.chatId,
      cwd: params.cwd,
      prompt: params.prompt,
      columnA: {
        slot: 'A',
        modelHandle: params.modelAHandle,
        provider: parsedA.provider,
        turnId: turnIdA,
        status: 'PENDING',
        text: '',
        errorMessage: null,
      },
      columnB: {
        slot: 'B',
        modelHandle: params.modelBHandle,
        provider: parsedB.provider,
        turnId: turnIdB,
        status: 'PENDING',
        text: '',
        errorMessage: null,
      },
      resolution: null,
      collapsed: false,
      roleViolationDetected: false,
      createdAt: now,
      updatedAt: now,
    };

    const entry: InternalOpinionState = { record, baseline };
    this.opinions.set(id, entry);
    this.slotByTurnId.set(turnIdA, { opinionId: id, slot: 'A' });
    this.slotByTurnId.set(turnIdB, { opinionId: id, slot: 'B' });
    this.emitUpdated(record);

    const readOnlyPrompt = `Provide a read-only second opinion analysis (do not modify repository files):\n${params.prompt}`;

    await Promise.all([
      this.turnRunner.startTurn(
        {
          projectId: params.projectId,
          chatId: params.chatId,
          cwd: params.cwd,
          modelHandle: params.modelAHandle,
          prompt: readOnlyPrompt,
          role: 'reviewer',
          approvalMode: 'plan',
        },
        { turnId: turnIdA },
      ),
      this.turnRunner.startTurn(
        {
          projectId: params.projectId,
          chatId: params.chatId,
          cwd: params.cwd,
          modelHandle: params.modelBHandle,
          prompt: readOnlyPrompt,
          role: 'reviewer',
          approvalMode: 'plan',
        },
        { turnId: turnIdB },
      ),
    ]);

    return entry.record;
  }

  resolveOpinion(params: SecondOpinionResolveParams): SecondOpinionRecord {
    const entry = this.opinions.get(params.secondOpinionId);
    if (!entry) {
      throw new Error(`SecondOpinion "${params.secondOpinionId}" not found.`);
    }
    return this.emitRecord(entry, {
      ...entry.record,
      resolution: params.resolution,
      collapsed: true,
      updatedAt: new Date().toISOString(),
    });
  }
}
