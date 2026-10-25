import { randomUUID } from 'node:crypto'
import { config } from './config.js'
import { analyzeUrl } from './analyzer.js'
import { store } from './store.js'
import type {
  Analysis,
  BrowserSession,
  Run,
  RunOptions,
  SessionLogLevel,
  SessionStatus,
} from './types.js'

export interface OrchestratorEvent {
  type: 'run.created' | 'run.updated' | 'run.tick' | 'session.updated'
  run?: Run
  runId?: string
  session?: BrowserSession
  ticks?: { id: string; elapsedMs: number; progress: number }[]
}

type EventHandler = (event: OrchestratorEvent) => void

const TERMINAL: SessionStatus[] = ['complete', 'blocked', 'stopped', 'error']

function emptyOptions(options?: Partial<RunOptions>): RunOptions {
  return {
    deepInspect: options?.deepInspect ?? true,
    aiSummary: options?.aiSummary ?? true,
    passiveScroll: options?.passiveScroll ?? true,
  }
}

export class Orchestrator {
  private runs = new Map<string, Run>()
  private active = new Map<string, AbortController>()
  private pauseRequested = new Set<string>()
  private onEvent: EventHandler = () => undefined
  private persistTimers = new Map<string, NodeJS.Timeout>()
  private tickTimer: NodeJS.Timeout | null = null
  private pumping = false

  async init(): Promise<void> {
    const recent = await store.listRuns(80)
    let repaired = 0
    for (const run of recent) {
      for (const session of run.sessions) {
        if (!TERMINAL.includes(session.status) && session.status !== 'paused') {
          session.status = 'error'
          session.error = session.error || 'Worker restarted before this session completed.'
          session.phaseMessage = 'Interrupted by worker restart'
          this.log(session, 'error', 'Worker restarted; session marked interrupted. Launch a new probe to retry.')
          repaired += 1
        }
      }
      if (['running', 'queued'].includes(run.status)) {
        run.status = 'error'
        run.completedAt = new Date().toISOString()
        repaired += 1
        await store.saveRun(run)
      }
      this.runs.set(run.id, run)
    }
    if (repaired) console.log(`[orchestrator] Marked ${repaired} interrupted record(s) after restart`)
    this.tickTimer = setInterval(() => this.tick(), 2000)
    this.tickTimer.unref()
  }

  setEventHandler(handler: EventHandler): void {
    this.onEvent = handler
  }

  activeSessionCount(): number {
    return this.active.size
  }

  listRuns(limit = 50): Run[] {
    return [...this.runs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  getRun(id: string): Run | undefined {
    return this.runs.get(id)
  }

  private log(session: BrowserSession, level: SessionLogLevel, message: string, action?: string): void {
    session.logs.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      level,
      message,
      action,
    })
    if (session.logs.length > 120) session.logs = session.logs.slice(-120)
  }

  private emit(event: OrchestratorEvent): void {
    try {
      this.onEvent(event)
    } catch (error) {
      console.warn('[orchestrator] event handler failed:', error)
    }
  }

  private schedulePersist(run: Run): void {
    const existing = this.persistTimers.get(run.id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.persistTimers.delete(run.id)
      void store.saveRun(run).catch((error) => console.error('[orchestrator] persist failed:', error))
    }, 750)
    timer.unref()
    this.persistTimers.set(run.id, timer)
  }

  private recomputeRun(run: Run): void {
    run.completedCount = run.sessions.filter((session) => session.status === 'complete' || session.status === 'blocked').length
    run.errorCount = run.sessions.filter((session) => session.status === 'error').length
    run.adCount = run.sessions.reduce((sum, session) => sum + session.ads.length, 0)
    const terminal = run.sessions.every((session) => TERMINAL.includes(session.status))
    if (terminal) {
      if (run.status !== 'stopped') run.status = run.errorCount === run.sessions.length && run.sessions.length > 0 ? 'error' : 'complete'
      run.completedAt ||= new Date().toISOString()
    } else if (run.status === 'complete') {
      run.status = 'running'
      run.completedAt = null
    }
  }

  async createRun(input: string, sessionCount: number, options?: Partial<RunOptions>, analysis?: Analysis | null): Promise<Run> {
    const count = Math.max(1, Math.min(config.maxSessionsPerRun, Math.floor(sessionCount) || 1))
    const runId = randomUUID()
    const now = new Date().toISOString()
    const sessions: BrowserSession[] = Array.from({ length: count }, (_, index) => {
      const session: BrowserSession = {
        id: randomUUID(),
        runId,
        index: index + 1,
        inputUrl: input,
        status: 'queued' as const,
        progress: 0,
        phaseMessage: 'Queued for an isolated browser context',
        currentUrl: analysis?.finalUrl || analysis?.normalizedUrl || null,
        finalUrl: null,
        finalDomain: null,
        createdAt: now,
        startedAt: null,
        completedAt: null,
        elapsedMs: 0,
        analysis: null,
        page: null,
        ads: [],
        logs: [],
        summary: null,
        error: null,
        serverId: 'local-worker',
        serverRegion: config.region,
        viewport: '1280 × 800',
        aiMode: config.ai.url && config.ai.key ? 'llm' : 'heuristic',
        screenshotUrl: null,
        screenshotUpdatedAt: null,
      }
      this.log(session, 'info', 'Probe queued. Passive inspection only — no ad clicking, CAPTCHA bypass, reward manipulation, or traffic generation.')
      if (analysis) this.log(session, 'info', `Shared redirect analysis resolved ${analysis.redirectCount} redirect hop(s).`)
      return session
    })

    const run: Run = {
      id: runId,
      inputUrl: input,
      sessionCount: count,
      status: 'running',
      createdAt: now,
      startedAt: now,
      completedAt: null,
      analysis: analysis || null,
      options: emptyOptions(options),
      sessions,
      completedCount: 0,
      errorCount: 0,
      adCount: 0,
    }
    this.runs.set(run.id, run)
    await store.saveRun(run)
    this.emit({ type: 'run.created', run })
    this.pump()
    return run
  }

  async startRun(runId: string): Promise<Run> {
    const run = this.requireRun(runId)
    if (run.status === 'complete') return run
    if (run.status === 'stopped' || run.status === 'error') {
      for (const session of run.sessions) {
        if (session.status === 'stopped' || session.status === 'error') {
          session.status = 'queued'
          session.progress = 0
          session.phaseMessage = 'Requeued by operator'
          session.error = null
          this.log(session, 'info', 'Session requeued by operator.')
        }
      }
    }
    run.status = 'running'
    run.completedAt = null
    this.recomputeRun(run)
    this.emit({ type: 'run.updated', run })
    this.schedulePersist(run)
    this.pump()
    return run
  }

  async pauseRun(runId: string): Promise<Run> {
    const run = this.requireRun(runId)
    if (run.status !== 'running') return run
    run.status = 'paused'
    this.emit({ type: 'run.updated', run })
    this.schedulePersist(run)
    return run
  }

  async resumeRun(runId: string): Promise<Run> {
    const run = this.requireRun(runId)
    if (run.status !== 'paused') return run
    run.status = 'running'
    for (const session of run.sessions) {
      if (session.status === 'paused') {
        session.status = 'queued'
        session.progress = 0
        session.phaseMessage = 'Resumed — waiting for a worker slot'
        this.log(session, 'info', 'Session resumed by operator.')
      }
    }
    this.emit({ type: 'run.updated', run })
    this.schedulePersist(run)
    this.pump()
    return run
  }

  async stopRun(runId: string): Promise<Run> {
    const run = this.requireRun(runId)
    run.status = 'stopped'
    run.completedAt = new Date().toISOString()
    for (const session of run.sessions) {
      if (session.status === 'queued' || session.status === 'paused') {
        session.status = 'stopped'
        session.phaseMessage = 'Stopped by operator'
        this.log(session, 'warn', 'Session stopped before execution.')
      }
    }
    for (const [sessionId, controller] of this.active) {
      if (run.sessions.some((session) => session.id === sessionId)) {
        controller.abort()
      }
    }
    this.recomputeRun(run)
    run.status = 'stopped'
    this.emit({ type: 'run.updated', run })
    await store.saveRun(run)
    return run
  }

  async startSession(runId: string, sessionId: string): Promise<BrowserSession> {
    const run = this.requireRun(runId)
    const session = this.requireSession(run, sessionId)
    if (this.active.has(sessionId)) return session
    if (session.status === 'complete' || session.status === 'blocked') {
      throw new Error('This session already completed. Start a new run to repeat it.')
    }
    session.status = 'queued'
    session.progress = 0
    session.phaseMessage = 'Queued by operator'
    session.error = null
    session.completedAt = null
    if (run.status !== 'running') {
      run.status = 'running'
      run.completedAt = null
    }
    this.log(session, 'info', 'Session queued by operator.')
    this.emit({ type: 'run.updated', run })
    this.schedulePersist(run)
    this.pump()
    return session
  }

  async pauseSession(runId: string, sessionId: string): Promise<BrowserSession> {
    const run = this.requireRun(runId)
    const session = this.requireSession(run, sessionId)
    if (this.active.has(sessionId)) {
      this.pauseRequested.add(sessionId)
      session.phaseMessage = 'Pause requested — finishing current inspection boundary'
      this.log(session, 'warn', 'Pause requested. The current browser inspection will stop at the next safe boundary.')
      this.emit({ type: 'session.updated', run, runId, session })
    } else if (session.status === 'queued') {
      session.status = 'paused'
      session.phaseMessage = 'Paused before start'
      this.log(session, 'warn', 'Session paused before execution.')
      this.emit({ type: 'run.updated', run })
    }
    this.schedulePersist(run)
    return session
  }

  async resumeSession(runId: string, sessionId: string): Promise<BrowserSession> {
    const run = this.requireRun(runId)
    const session = this.requireSession(run, sessionId)
    if (session.status === 'paused') {
      session.status = 'queued'
      session.phaseMessage = 'Resumed — waiting for a worker slot'
      session.progress = 0
      this.log(session, 'info', 'Session resumed by operator.')
      if (run.status !== 'running') {
        run.status = 'running'
        run.completedAt = null
      }
      this.emit({ type: 'run.updated', run })
      this.schedulePersist(run)
      this.pump()
    }
    return session
  }

  async stopSession(runId: string, sessionId: string): Promise<BrowserSession> {
    const run = this.requireRun(runId)
    const session = this.requireSession(run, sessionId)
    const controller = this.active.get(sessionId)
    if (controller) controller.abort()
    this.pauseRequested.delete(sessionId)
    if (!TERMINAL.includes(session.status)) {
      session.status = 'stopped'
      session.phaseMessage = 'Stopped by operator'
      session.completedAt = new Date().toISOString()
      session.progress = 100
      this.log(session, 'warn', 'Session stopped by operator.')
    }
    this.recomputeRun(run)
    this.emit({ type: 'run.updated', run })
    this.schedulePersist(run)
    return session
  }

  private requireRun(runId: string): Run {
    const run = this.runs.get(runId)
    if (!run) throw new Error('Run not found.')
    return run
  }

  private requireSession(run: Run, sessionId: string): BrowserSession {
    const session = run.sessions.find((item) => item.id === sessionId)
    if (!session) throw new Error('Session not found.')
    return session
  }

  private pump(): void {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.active.size < config.maxConcurrentSessions) {
        const candidate = this.nextQueued()
        if (!candidate) break
        const controller = new AbortController()
        this.active.set(candidate.session.id, controller)
        candidate.session.status = 'resolving'
        candidate.session.progress = 5
        candidate.session.phaseMessage = 'Validating URL and redirect chain'
        candidate.session.startedAt = candidate.session.startedAt || new Date().toISOString()
        this.emit({ type: 'session.updated', run: candidate.run, runId: candidate.run.id, session: candidate.session })
        void this.executeSession(candidate.run, candidate.session, controller).finally(() => {
          this.active.delete(candidate.session.id)
          this.pump()
        })
      }
    } finally {
      this.pumping = false
    }
  }

  private nextQueued(): { run: Run; session: BrowserSession } | null {
    const candidates = [...this.runs.values()]
      .filter((run) => run.status === 'running')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const run of candidates) {
      const session = run.sessions.find((item) => item.status === 'queued')
      if (session) return { run, session }
    }
    return null
  }

  private async executeSession(run: Run, session: BrowserSession, controller: AbortController): Promise<void> {
    try {
      session.status = 'resolving'
      session.progress = 8
      session.phaseMessage = 'Validating URL and redirect chain'
      this.log(session, 'info', 'URL validation started.')
      this.emit({ type: 'session.updated', run, runId: run.id, session })
      this.schedulePersist(run)

      const result = await analyzeUrl(session.inputUrl, {
        deep: run.options.deepInspect,
        aiSummary: run.options.aiSummary,
        passiveScroll: run.options.passiveScroll,
        screenshotId: `session_${session.id}`,
        signal: controller.signal,
        onPhase: (phase, message) => {
          if (controller.signal.aborted || this.pauseRequested.has(session.id) || session.status === 'stopped') return
          const progress = phase === 'resolving' ? 18 : phase === 'opening' ? 34 : phase === 'inspecting' ? 58 : 82
          session.status = phase === 'resolving' ? 'resolving' : phase === 'opening' ? 'opening' : phase === 'inspecting' ? 'inspecting' : 'analyzing'
          session.progress = progress
          session.phaseMessage = message
          this.log(session, 'info', message, phase)
          this.emit({ type: 'session.updated', run, runId: run.id, session })
          this.schedulePersist(run)
        },
      })

      if (controller.signal.aborted || (session.status as SessionStatus) === 'stopped') {
        session.status = 'stopped'
        session.completedAt = new Date().toISOString()
        session.progress = 100
        session.phaseMessage = 'Stopped by operator'
        this.log(session, 'warn', 'Browser context closed by operator.')
        this.recomputeRun(run)
        this.emit({ type: 'run.updated', run })
        await store.saveRun(run)
        return
      }

      if (this.pauseRequested.has(session.id) || run.status === 'paused') {
        this.pauseRequested.delete(session.id)
        session.status = 'paused'
        session.completedAt = null
        session.phaseMessage = 'Paused at inspection boundary'
        session.analysis = result.analysis
        session.page = result.analysis.page
        session.ads = result.analysis.page?.adObservations || []
        session.summary = result.analysis.aiSummary
        session.finalUrl = result.analysis.finalUrl
        session.finalDomain = result.analysis.finalDomain
        this.log(session, 'warn', 'Paused after inspection. Resume to requeue this session.')
        this.emit({ type: 'run.updated', run })
        this.schedulePersist(run)
        return
      }

      session.analysis = result.analysis
      session.page = result.analysis.page
      session.ads = result.analysis.page?.adObservations || []
      session.summary = result.analysis.aiSummary
      session.aiMode = result.aiMode
      session.finalUrl = result.analysis.finalUrl
      session.finalDomain = result.analysis.finalDomain
      session.currentUrl = result.analysis.finalUrl || result.analysis.normalizedUrl
      session.screenshotUrl = result.analysis.page?.screenshotUrl || null
      session.screenshotUpdatedAt = result.analysis.page?.screenshotUpdatedAt || null
      session.completedAt = new Date().toISOString()
      session.elapsedMs = Math.max(0, Date.now() - Date.parse(session.startedAt || session.completedAt))
      session.progress = 100

      for (const hop of result.analysis.redirects) {
        if (hop.statusCode && hop.statusCode >= 300 && hop.statusCode < 400) {
          this.log(session, 'info', `Redirect ${hop.statusCode} → ${hop.location || 'unknown destination'}`, 'redirect')
        }
      }
      if (result.analysis.page?.captcha) {
        this.log(session, 'warn', 'CAPTCHA detected. Automated actions stopped at the verification boundary.', 'safety')
      }
      if (result.analysis.page?.adObservations.length) {
        this.log(session, 'info', `${result.analysis.page.adObservations.length} advertising container(s) observed. Recorded as observations, not impressions.`, 'ad_scan')
      }

      const blocked = Boolean(result.analysis.page?.captcha || result.analysis.page?.blocked || result.analysis.flags.some((flag) => flag.code === 'blocked' && flag.severity === 'high'))
      if (result.analysis.status === 'error') {
        session.status = 'error'
        session.error = result.analysis.error || 'Analysis failed.'
        session.phaseMessage = 'Inspection error'
        this.log(session, 'error', session.error)
      } else if (blocked) {
        session.status = 'blocked'
        session.error = result.analysis.page?.blockedReason || 'Destination blocked or requires human verification.'
        session.phaseMessage = 'Blocked or human-verification boundary'
        this.log(session, 'warn', session.error)
      } else {
        session.status = 'complete'
        session.phaseMessage = 'Inspection complete'
        this.log(session, 'success', `Inspection complete in ${session.elapsedMs} ms. Final domain: ${session.finalDomain || 'unknown'}.`)
      }

      this.recomputeRun(run)
      this.emit({ type: 'run.updated', run })
      await store.saveRun(run)

      if (run.status === 'running') this.pump()
    } catch (error) {
      const aborted = controller.signal.aborted
      session.completedAt = new Date().toISOString()
      session.elapsedMs = Math.max(0, Date.now() - Date.parse(session.startedAt || session.completedAt))
      session.progress = 100
      if (aborted || session.status === 'stopped') {
        session.status = 'stopped'
        session.phaseMessage = 'Stopped by operator'
        this.log(session, 'warn', 'Session stopped.')
      } else {
        session.status = 'error'
        session.error = error instanceof Error ? error.message : 'Unknown session failure.'
        session.phaseMessage = 'Session error'
        this.log(session, 'error', session.error)
      }
      this.pauseRequested.delete(session.id)
      this.recomputeRun(run)
      this.emit({ type: 'run.updated', run })
      await store.saveRun(run)
    }
  }

  private tick(): void {
    const now = Date.now()
    for (const run of this.runs.values()) {
      if (run.status !== 'running') continue
      const ticks = run.sessions
        .filter((session) => this.active.has(session.id) && session.startedAt)
        .map((session) => ({
          id: session.id,
          elapsedMs: Math.max(0, now - Date.parse(session.startedAt as string)),
          progress: session.progress,
        }))
      if (ticks.length) this.emit({ type: 'run.tick', runId: run.id, ticks })
    }
  }

  async shutdown(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer)
    for (const controller of this.active.values()) controller.abort()
    for (const timer of this.persistTimers.values()) clearTimeout(timer)
    for (const run of this.runs.values()) {
      try {
        await store.saveRun(run)
      } catch {
        // Best effort during shutdown.
      }
    }
  }
}

export const orchestrator = new Orchestrator()
