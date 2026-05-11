import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');
const oldSeedPath = process.env.OLD_GATEWAY_SEED || path.join(workspaceRoot, 'ai-gateway-render-console', 'scripts', 'seed-render-data.js');
const outputPath = process.env.NEW_API_CHANNELS_JSON || path.join(__dirname, 'newapi-channels.generated.json');

function loadModelsConfig(seedPath) {
  const source = fs.readFileSync(seedPath, 'utf8');
  const start = source.indexOf('const MODELS_CONFIG = [');
  if (start < 0) throw new Error('MODELS_CONFIG not found in old seed');

  const arrayStart = source.indexOf('[', start);
  const endMarker = '\n];';
  const end = source.indexOf(endMarker, arrayStart);
  if (end < 0) throw new Error('MODELS_CONFIG closing marker not found');

  const arrayCode = source.slice(arrayStart, end + 2);
  const context = vm.createContext({});
  return vm.runInContext(arrayCode, context, { timeout: 1000 });
}

function hostnameFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return rawUrl.replace(/^https?:\/\//, '').split('/')[0];
  }
}

function normalizeOpenAIBaseUrl(rawUrl) {
  return rawUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function toNewApiChannels(models) {
  const groups = new Map();
  for (const model of models) {
    if (!model || !model.url || !model.apiKey) continue;
    const key = `${model.url}\n${model.apiKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        url: model.url,
        apiKey: model.apiKey,
        models: [],
        mappings: {},
      });
    }
    const group = groups.get(key);
    const exposedModel = model.id || model.modelId || model.name;
    const upstreamModel = model.modelId || model.id || model.name;
    group.models.push(exposedModel);
    if (exposedModel && upstreamModel && exposedModel !== upstreamModel) {
      group.mappings[exposedModel] = upstreamModel;
    }
  }

  return [...groups.values()].map((group, index) => {
    const host = hostnameFromUrl(group.url);
    const modelNames = unique(group.models);
    const modelMapping = Object.keys(group.mappings).length > 0 ? JSON.stringify(group.mappings) : '';
    return {
      type: 1,
      key: group.apiKey,
      status: 1,
      name: `${host}-openai-compatible-${index + 1}`,
      base_url: normalizeOpenAIBaseUrl(group.url),
      models: modelNames.join(','),
      group: 'default',
      model_mapping: modelMapping,
      auto_ban: 1,
      priority: 0,
      weight: 100,
      remark: `Migrated from old ai-gateway seed: ${host}`,
    };
  });
}

const models = loadModelsConfig(oldSeedPath);
const channels = toNewApiChannels(models);
fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: oldSeedPath, channelCount: channels.length, channels }, null, 2));
console.log(`Generated ${channels.length} New API channels -> ${outputPath}`);
