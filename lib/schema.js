import { isCountKey, isSecretKey, sanitizeText } from './redact.js';

// Only these top-level Auto Memory settings are exported. New or unknown
// settings are intentionally omitted rather than guessed at export time.
export const AUTO_MEMORY_ALLOW = new Set([
  'activationInboxEnabled', 'activationSource', 'associativeMemoryEnabled',
  'autoArchiveCheckMin', 'autoArchiveDays', 'autoArchiveEnabled', 'autoConsolidate',
  'autoConsolidateCooldownMinutes', 'autoConsolidateDailyMax', 'autoConsolidateMinChars',
  'autoContinueConfirmSeconds', 'autoContinueCooldownMinutes', 'autoContinueEnabled',
  'autoContinueRefreshRitual', 'autoContinueRefreshTimeoutSeconds', 'autoContinueThreshold',
  'autoDeleteDays', 'autoDeleteEnabled', 'autoPopupEnabled', 'autoSummaryTimes', 'awayMinutes',
  'boardMode', 'capacityDefaultsVersion', 'consolidateScheduleDays', 'consolidateScheduleEnabled',
  'consolidateScheduleTime', 'contextBridgeEnabled', 'contextBridgeObserveChildSessions',
  'contextSinkMode', 'criteriaGate', 'dayBoundaryMinutes', 'episodicMinSegments',
  'episodicRetention', 'externalInjectionChars', 'factRetentionMax',
  'fullEverySlims', 'fullEverySlimsDefaultsVersion', 'globalBriefChars', 'globalBriefEnabled',
  'globalBriefUnattended', 'globalBriefWatchDocs', 'globalBriefWatchExternal',
  'globalBriefWatchMemory', 'globalBriefWatchTeam', 'handoffEnabled', 'handoffLedgerChars',
  'handoffPlanChars', 'injectBudgetChars', 'injectEnabled', 'injectionCooldownSteps',
  'jsDecideCandidateScheme', 'jsDecideCandidatesN', 'jsDecideCooldownRounds',
  'jsDecideDeltaExp', 'jsDecideExcerptChars', 'l0IndexEnabled', 'locale',
  'maintainScheduleEnabled', 'maintainScheduleTime', 'maxPacketChars', 'maxPacketItems',
  'memoryAnchorEnabled', 'memoryFileIndexEnabled', 'memoryHubEnabled',
  'noteCapacityChars', 'packetTtlSteps', 'procedureActiveLevel', 'procedureCorrectionCap',
  'procedureHighRiskApproval', 'procedureInjectEnabled', 'procedureMinSessions',
  'procedureMinSuccess', 'procedurePromotionEnabled', 'promptSectionToggles',
  'pythonBackendEnabled', 'reasoningObserverEnabled', 'recentDaysInjected', 'reflectEnabled',
  'reflectStyle', 'rulesLayeringMode', 'semanticEmbedIncremental', 'semanticEngineMode',
  'sessionArchiveEnabled', 'settingsEntryInDsSettings', 'settingsEntryInPluginsPage',
  'shadowRetrievalEnabled', 'slimEveryDefaultsVersion', 'slimEveryRounds', 'slimLedgerChars',
  'slimPlanChars', 'snapshotGapDefaultsVersion', 'snapshotMinGapRounds',
  'snapshotReinjectOnCompact', 'snapshotTieredInject', 'softInjectionEnabled',
  'streamingInterruptionEnabled', 'subagentGcEnabled', 'subagentGcKeepDays', 'subagentModel',
  'subagentProvider', 'subagentReasoningEffort', 'subagentReasoningEffortLong',
  'subagentReasoningEffortShort', 'teamAuditEnabled', 'teamBucket', 'teamConflictPolicy',
  'teamDerivedDebounceMs', 'teamE2E', 'teamEnabled', 'teamId',
  'teamInjectEnabled', 'teamMaxConflicts', 'teamMemberName', 'teamOutboxMaxItems',
  'teamPathStyle', 'teamProjectId', 'teamRegion', 'teamShowMemberBadges',
  'teamSyncIntervalMs', 'teamSyncTransport', 'teamUsageLog', 'teamUsageReport',
  'tier0BudgetShare', 'tier0CatalogEnabled', 'tier0MaxTokens', 'unattendedAuto',
  'unattendedAutoHours', 'unattendedMode', 'userCapacityChars',
  'waterLevelAdvisory', 'waterLevelAutoHandoff', 'waterLevelAutoMargin',
  'waterLevelThreshold', 'waterLevelThresholdMode', 'waterLevelWindowTokens',
  'welcomeTourEnabled', 'workbenchEnabled', 'workbenchLoopLong', 'workbenchLoopShort',
  'workbenchPeriodDays', 'workbenchRetryMs', 'workspaceDiscoverMax',
]);

// Text/path fields that are intentionally not exported even though the
// top-level setting is readable. They are prompt text or local layout data.
const AUTO_MEMORY_OMIT = new Set([
  'externalSources', 'globalBriefInstruction', 'localWasmPaths', 'memoryRoot',
  'projectMemoryDir', 'promptLayerOverrides', 'pythonBackendExecutable',
  'pythonBackendWorkerPath', 'teamEndpoint', 'teamPathStyle', 'teamServerUrl',
  'teamUsageLog', 'userMemoryDir', 'workbenchRoot',
]);

// Scalar types for the allowlisted Auto Memory settings. Unknown or untyped
// keys are omitted; a value with the wrong JSON type is never coerced.
const AUTO_MEMORY_BOOLEAN = new Set([
  'activationInboxEnabled', 'associativeMemoryEnabled', 'autoArchiveEnabled', 'autoConsolidate',
  'autoContinueEnabled', 'autoContinueRefreshRitual', 'autoDeleteEnabled', 'autoPopupEnabled',
  'consolidateScheduleEnabled', 'contextBridgeEnabled', 'contextBridgeObserveChildSessions',
  'criteriaGate', 'globalBriefEnabled', 'globalBriefUnattended', 'globalBriefWatchDocs',
  'globalBriefWatchExternal', 'globalBriefWatchMemory', 'globalBriefWatchTeam', 'handoffEnabled',
  'injectEnabled', 'l0IndexEnabled', 'maintainScheduleEnabled', 'memoryAnchorEnabled',
  'memoryFileIndexEnabled', 'memoryHubEnabled', 'procedureHighRiskApproval',
  'procedureInjectEnabled', 'procedurePromotionEnabled', 'pythonBackendEnabled',
  'reasoningObserverEnabled', 'reflectEnabled', 'semanticEmbedIncremental', 'sessionArchiveEnabled',
  'settingsEntryInDsSettings', 'settingsEntryInPluginsPage', 'shadowRetrievalEnabled',
  'snapshotReinjectOnCompact', 'snapshotTieredInject', 'softInjectionEnabled',
  'streamingInterruptionEnabled', 'subagentGcEnabled', 'teamAuditEnabled', 'teamEnabled',
  'teamInjectEnabled', 'teamPathStyle', 'teamShowMemberBadges', 'teamUsageReport',
  'tier0CatalogEnabled', 'unattendedAuto', 'unattendedMode', 'waterLevelAdvisory',
  'waterLevelAutoHandoff', 'welcomeTourEnabled', 'workbenchEnabled',
]);

const AUTO_MEMORY_NUMBER = new Set([
  'autoArchiveCheckMin', 'autoArchiveDays', 'autoConsolidateCooldownMinutes',
  'autoConsolidateDailyMax', 'autoConsolidateMinChars', 'autoContinueConfirmSeconds',
  'autoContinueCooldownMinutes', 'autoContinueRefreshTimeoutSeconds', 'autoContinueThreshold',
  'autoDeleteDays', 'awayMinutes', 'capacityDefaultsVersion', 'consolidateScheduleDays',
  'dayBoundaryMinutes', 'episodicMinSegments', 'episodicRetention', 'externalInjectionChars',
  'factRetentionMax', 'fullEverySlims', 'fullEverySlimsDefaultsVersion', 'globalBriefChars',
  'handoffLedgerChars', 'handoffPlanChars', 'injectBudgetChars', 'injectionCooldownSteps',
  'jsDecideCandidatesN', 'jsDecideCooldownRounds', 'jsDecideDeltaExp', 'jsDecideExcerptChars',
  'maxPacketChars', 'maxPacketItems', 'noteCapacityChars', 'packetTtlSteps',
  'procedureCorrectionCap', 'procedureMinSessions', 'procedureMinSuccess', 'recentDaysInjected',
  'slimEveryDefaultsVersion', 'slimEveryRounds', 'slimLedgerChars', 'slimPlanChars',
  'snapshotGapDefaultsVersion', 'snapshotMinGapRounds', 'subagentGcKeepDays',
  'teamDerivedDebounceMs', 'teamMaxConflicts', 'teamOutboxMaxItems', 'teamSyncIntervalMs',
  'tier0BudgetShare', 'tier0MaxTokens', 'userCapacityChars', 'waterLevelAutoMargin',
  'waterLevelThreshold', 'waterLevelWindowTokens', 'workbenchLoopLong', 'workbenchLoopShort',
  'workbenchPeriodDays', 'workbenchRetryMs', 'workspaceDiscoverMax',
]);

// Strict per-plugin schemas. A plugin without an entry gets no config export at
// all, even if it has a familiar-looking key. Unknown nested keys are dropped.
const S = (max = 256) => ({ type: 'string', max });
const B = () => ({ type: 'boolean' });
const N = () => ({ type: 'number' });
const ENUM = (...values) => ({ type: 'enum', values });
const ARR = (items, max = 64) => ({ type: 'array', items, max });
const OBJ = (schema, max = 32) => ({ type: 'object', schema, max });

export const PLUGIN_SCHEMAS = {
  'dsh-prompt-inject': {
    activeTemplate: S(128),
    // Template names and count only. Template body is persona/story text and is
    // never exported; `includePromptLibrary` does not apply to this plugin.
    templates: ARR(OBJ({ name: S(128) }, 4), 32),
  },
  'billion-context': {
    enabled: B(), mode: ENUM('off', 'observe', 'active'), debug: B(),
    maxTokens: N(), model: S(128), provider: S(64),
  },
  'dsh-context': {
    enabled: B(), debug: B(), maxTokens: N(), model: S(128), provider: S(64),
  },
  'cc-safety-net': {
    enabled: B(), mode: ENUM('enforce', 'warn', 'off'),
  },
  'dsh-cost-meter': {
    enabled: B(), currency: S(8), display: S(32),
  },
  'dsh-smooth-stream': {
    enabled: B(), speed: N(), chunkSize: N(),
  },
  'dsh-emoji': {
    frequent: B(), enabled: B(),
  },
  'dsh-ui-appearance': {
    fontSize: N(), theme: S(32), density: S(32),
  },
  'dshmarket': {
    enabled: B(), registry: S(128),
  },
};

function validate(value, rule, depth = 0) {
  if (!rule || depth > 8) return undefined;
  switch (rule.type) {
    case 'string': {
      if (typeof value !== 'string') return undefined;
      const text = sanitizeText(value).trim();
      if (!text) return undefined;
      return text.length > rule.max ? `${text.slice(0, rule.max)}…` : text;
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'enum':
      return rule.values.includes(value) ? value : undefined;
    case 'array': {
      if (!Array.isArray(value)) return undefined;
      const out = value.slice(0, rule.max).map((item) => validate(item, rule.items, depth + 1)).filter((item) => item !== undefined);
      return out.length ? out : undefined;
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const out = {};
      for (const [key, child] of Object.entries(value).slice(0, rule.max)) {
        const ruleForKey = rule.schema[key];
        if (!ruleForKey) continue;
        const sanitized = validate(child, ruleForKey, depth + 1);
        if (sanitized !== undefined) out[key] = sanitized;
      }
      return Object.keys(out).length ? out : undefined;
    }
    default:
      return undefined;
  }
}

export function sanitizePluginConfig(pluginName, value) {
  if (typeof pluginName !== 'string' || !value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const schema = PLUGIN_SCHEMAS[pluginName];
  if (!schema) return undefined; // Unknown plugin: metadata only, no config.
  const result = {};
  for (const [key, rule] of Object.entries(schema)) {
    if (!Object.hasOwn(value, key) || isSecretKey(key)) continue;
    const sanitized = validate(value[key], rule);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return Object.keys(result).length ? result : undefined;
}

export function sanitizeAutoMemory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const key of AUTO_MEMORY_ALLOW) {
    if (!Object.hasOwn(value, key) || isSecretKey(key) || AUTO_MEMORY_OMIT.has(key)) continue;
    const child = value[key];
    let accepted = false;
    if (AUTO_MEMORY_BOOLEAN.has(key)) accepted = typeof child === 'boolean';
    else if (AUTO_MEMORY_NUMBER.has(key) || isCountKey(key)) accepted = typeof child === 'number' && Number.isFinite(child);
    else accepted = typeof child === 'string';
    if (!accepted) continue;
    result[key] = typeof child === 'string' ? sanitizeText(child) : child;
  }
  return result;
}

export function sanitizeSkillsState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  if (Number.isInteger(value.version) && value.version >= 0 && value.version <= 1000) result.version = value.version;
  if (value.sources && typeof value.sources === 'object' && !Array.isArray(value.sources)) {
    const sources = {};
    // Only DSH source is relevant; other tools' source flags and any nested
    // auth objects are intentionally dropped.
    if (typeof value.sources.dsh === 'boolean') sources.dsh = value.sources.dsh;
    if (Object.keys(sources).length) result.sources = sources;
  }
  for (const key of ['disabledSkills', 'enabledSkills']) {
    const raw = value[key];
    // Real Skills Manager shape is {dsh:[...]}; tolerate the old flat array,
    // but never export other tools' lists.
    const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray(raw.dsh) ? raw.dsh : null;
    if (!list) continue;
    const out = list
      .filter((item) => typeof item === 'string')
      .slice(0, 500)
      .map((item) => sanitizeText(item).slice(0, 256));
    if (out.length) result[key] = { dsh: out };
    else result[key] = { dsh: [] };
  }
  return result;
}

export function sanitizeSafetyPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const top = new Set(['version', 'safety', 'secret_protection']);
  if (Object.keys(value).some((key) => !top.has(key))) return undefined;
  if (!Number.isInteger(value.version) || value.version < 1 || value.version > 100) return undefined;
  const result = { version: value.version };
  if (value.safety !== undefined) {
    if (!value.safety || typeof value.safety !== 'object' || Array.isArray(value.safety)) return undefined;
    const keys = Object.keys(value.safety);
    if (keys.some((key) => key !== 'level')) return undefined;
    if (!['standard', 'strict', 'paranoid'].includes(value.safety.level)) return undefined;
    result.safety = { level: value.safety.level };
  }
  if (value.secret_protection !== undefined) {
    const sp = value.secret_protection;
    if (!sp || typeof sp !== 'object' || Array.isArray(sp)) return undefined;
    if (Object.keys(sp).some((key) => !['enabled', 'deny_paths'].includes(key))) return undefined;
    if (typeof sp.enabled !== 'boolean') return undefined;
    if (!Array.isArray(sp.deny_paths) || sp.deny_paths.length > 100) return undefined;
    const denyPaths = sp.deny_paths
      .filter((item) => typeof item === 'string' && item.length > 0 && item.length <= 1024)
      .map((item) => sanitizeText(item));
    if (denyPaths.length !== sp.deny_paths.length) return undefined;
    result.secret_protection = { enabled: sp.enabled, deny_paths: denyPaths };
  }
  return Object.keys(result).length ? result : undefined;
}

export function sanitizeDependencySpec(value) {
  if (typeof value !== 'string') return '[INVALID]';
  const spec = value.trim();
  if (!spec) return '[EMPTY]';
  if (/^(?:file|link):/i.test(spec)) {
    const scheme = spec.match(/^(file|link):/i)?.[1].toLowerCase() ?? 'file';
    const base = spec.replace(/^(?:file|link):/i, '').replaceAll('\\', '/').split('/').filter(Boolean).at(-1) || '[PATH]';
    // The basename is display-only; dependency inventory keeps the actual
    // archive separately and never stores this string in the ZIP.
    return `${scheme}:${sanitizeText(base).slice(0, 128)}`;
  }
  if (spec.includes('://')) {
    let parsed;
    try { parsed = new URL(spec); } catch { parsed = null; }
    if (parsed) {
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      // Dependency source is recorded structurally; do not keep a URL path
      // that may embed a token.
      return `${parsed.protocol}//${parsed.host}`;
    }
    return '[UNRECOGNIZED]';
  }
  if (/^[~^*<>=\dA-Za-z.+|-]+$/.test(spec)) return spec;
  return '[UNRECOGNIZED]';
}

export function sanitizeDependencies(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [name, version] of Object.entries(value)) {
    if (typeof name !== 'string' || !name) continue;
    result[name] = sanitizeDependencySpec(version);
  }
  return result;
}

export function sanitizeProfilePackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const key of ['name', 'version', 'description', 'type', 'packageManager']) {
    if (typeof value[key] === 'string') result[key] = sanitizeText(value[key]).slice(0, 256);
  }
  if (typeof value.private === 'boolean') result.private = value.private;
  if (value.engines && typeof value.engines === 'object' && !Array.isArray(value.engines)) {
    const engines = {};
    for (const [name, spec] of Object.entries(value.engines).slice(0, 16)) {
      if (typeof spec === 'string') engines[name] = sanitizeText(spec).slice(0, 128);
    }
    if (Object.keys(engines).length) result.engines = engines;
  }
  if (value.dependencies && typeof value.dependencies === 'object' && !Array.isArray(value.dependencies)) {
    result.dependencies = sanitizeDependencies(value.dependencies);
  }
  if (value.devDependencies && typeof value.devDependencies === 'object' && !Array.isArray(value.devDependencies)) {
    result.devDependencies = sanitizeDependencies(value.devDependencies);
  }
  if (value.dsh && typeof value.dsh === 'object' && !Array.isArray(value.dsh)) {
    const dsh = {};
    for (const key of ['name', 'version', 'platform', 'description', 'immediately']) {
      const child = value.dsh[key];
      if (typeof child === 'string') dsh[key] = sanitizeText(child);
      else if (typeof child === 'boolean') dsh[key] = child;
    }
    if (value.dsh.bundle && typeof value.dsh.bundle === 'object' && !Array.isArray(value.dsh.bundle)) {
      const bundle = {};
      if (typeof value.dsh.bundle.patch === 'string') bundle.patch = sanitizeText(value.dsh.bundle.patch).slice(0, 256);
      if (Object.keys(bundle).length) dsh.bundle = bundle;
    }
    if (value.dsh.client && typeof value.dsh.client === 'object' && !Array.isArray(value.dsh.client)) {
      const client = {};
      if (typeof value.dsh.client.platform === 'string') client.platform = sanitizeText(value.dsh.client.platform).slice(0, 32);
      if (typeof value.dsh.client.immediately === 'boolean') client.immediately = value.dsh.client.immediately;
      if (Array.isArray(value.dsh.client.inject)) {
        client.inject = value.dsh.client.inject.filter((item) => typeof item === 'string').slice(0, 64).map((item) => sanitizeText(item).slice(0, 128));
      }
      if (Object.keys(client).length) dsh.client = client;
    }
    if (value.dsh.profile && typeof value.dsh.profile === 'object' && !Array.isArray(value.dsh.profile)) {
      const bundles = Array.isArray(value.dsh.profile.bundles)
        ? value.dsh.profile.bundles.filter((item) => typeof item === 'string').slice(0, 500).map((item) => sanitizeText(item).slice(0, 256))
        : undefined;
      dsh.profile = { ...(bundles ? { bundles } : {}) };
    }
    if (typeof value.dsh.requires === 'string') dsh.requires = sanitizeText(value.dsh.requires).slice(0, 64);
    if (Object.keys(dsh).length) result.dsh = dsh;
  }
  return result;
}
