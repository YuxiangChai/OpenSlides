import React, { useState, useEffect } from "react";
import { X, Check, AlertCircle, Eye, EyeOff, Globe, DollarSign, Cpu, Key, CircleDot, Info, Search } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import { AIProvider } from "@/types";
import { lookupPricing } from "@/lib/ai";
import { fetchJson, fetchOk } from "@/lib/http";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProviderOption {
  value: AIProvider;
  label: string;
  defaultModel: string;
  defaultBaseUrl: string;
  description: string;
  descZh: string;
  cachingInfo?: string;
  cachingInfoZh?: string;
  info?: string;
  infoZh?: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'claude',
    label: 'Claude',
    defaultModel: 'claude-sonnet-4.6',
    defaultBaseUrl: 'https://api.anthropic.com',
    description: 'Anthropic native API',
    descZh: 'Anthropic 原生 API',
    cachingInfo: 'Claude requires explicit cache_control markers (auto-configured). Cache reads cost 0.1x input price.',
    cachingInfoZh: 'Claude 需要显式 cache_control 标记（已自动设置）。缓存读取费用为输入价格的 0.1 倍。',
  },
  {
    value: 'gemini',
    label: 'Gemini',
    defaultModel: 'gemini-3.1-pro-preview',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    description: 'Google Gemini native API',
    descZh: 'Google Gemini 原生 API',
    cachingInfo: 'Gemini caches automatically -- repeated identical prefixes are cached with no extra setup.',
    cachingInfoZh: 'Gemini 自动缓存——重复的相同前缀会被自动缓存，无需额外设置。',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-5.4',
    defaultBaseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI API and compatible providers',
    descZh: 'OpenAI API 及兼容服务商',
    cachingInfo: 'OpenAI caches automatically for prompts >= 1024 tokens. Cached tokens get ~50% discount.',
    cachingInfoZh: 'OpenAI 对 >= 1024 token 的提示自动缓存。缓存 token 享受约 50% 折扣。',
  },
  {
    value: 'kimi',
    label: 'Kimi Coding',
    defaultModel: 'kimi-k2.5',
    defaultBaseUrl: 'https://api.kimi.com/coding/v1',
    description: 'Moonshot Kimi coding plan',
    descZh: 'Moonshot Kimi 编程套餐',
    info: 'This entry uses the Kimi Coding Plan endpoint. Subscribe at kimi.com/code to get an API key. For direct Kimi API access (pay-as-you-go), use the OpenAI entry with base URL https://api.moonshot.cn/v1 instead.',
    infoZh: '此入口使用 Kimi 编程套餐端点。请在 kimi.com/code 订阅获取 API 密钥。如需使用 Kimi 直接 API（按量付费），请使用 OpenAI 入口并将 Base URL 设为 https://api.moonshot.cn/v1。',
  },
  {
    value: 'zhipu',
    label: 'GLM Coding',
    defaultModel: 'GLM-5',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    description: 'Zhipu GLM coding plan',
    descZh: '智谱 GLM 编程套餐',
    info: 'This entry uses the Zhipu GLM Coding Plan. Subscribe at open.bigmodel.cn to get an API key. For direct Zhipu API access (pay-as-you-go), use the OpenAI entry with the same base URL.',
    infoZh: '此入口使用智谱 GLM 编程套餐。请在 open.bigmodel.cn 订阅获取 API 密钥。如需使用智谱直接 API（按量付费），请使用 OpenAI 入口并填入相同的 Base URL。',
  },
  {
    value: 'qwen',
    label: 'Qwen Coding',
    defaultModel: 'qwen3.5-plus',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: 'Alibaba Qwen coding plan',
    descZh: '阿里通义千问编程套餐',
    info: 'This entry uses the Alibaba Qwen Coding Plan. Subscribe at dashscope.aliyuncs.com to get an API key. For direct Qwen API access (pay-as-you-go), use the OpenAI entry with the same base URL.',
    infoZh: '此入口使用阿里通义千问编程套餐。请在 dashscope.aliyuncs.com 订阅获取 API 密钥。如需使用千问直接 API（按量付费），请使用 OpenAI 入口并填入相同的 Base URL。',
  },
];

// Per-provider credentials stored in memory while modal is open
type ProviderConfigs = Record<string, { apiKey: string; model: string; baseUrl: string }>;

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeProvider, setActiveProvider] = useState<AIProvider>('gemini');
  const [selectedTab, setSelectedTab] = useState<AIProvider | 'search'>('gemini');
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigs>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [showTavilyKey, setShowTavilyKey] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [priceCached, setPriceCached] = useState("");
  const [priceOutput, setPriceOutput] = useState("");
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [pricingData, setPricingData] = useState<{ models: Record<string, any>; custom: Record<string, any> } | null>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    if (isOpen) {
      setSaveStatus(null);
      setShowApiKey(false);
      fetchJson<any>('/api/settings', undefined, 'Failed to load settings')
        .then(data => {
          const active = data.activeProvider || 'gemini';
          setActiveProvider(active);
          setSelectedTab(active);
          setProviderConfigs(data.providers || {});
          setTavilyApiKey(data.tavilyApiKey || '');
        })
        .catch(() => {
          setActiveProvider('gemini');
          setSelectedTab('gemini');
          setProviderConfigs({});
          setTavilyApiKey('');
        });
      fetchJson<any>('/api/pricing', undefined, 'Failed to load pricing')
        .then(data => setPricingData(data))
        .catch(() => {});
    }
  }, [isOpen]);

  const selectedProvider = selectedTab !== 'search' ? selectedTab : activeProvider;
  const providerOpt = PROVIDER_OPTIONS.find(p => p.value === selectedProvider) || PROVIDER_OPTIONS[0];
  const currentCfg = providerConfigs[selectedProvider] || { apiKey: '', model: '', baseUrl: '' };

  const effectiveModel = currentCfg.model.trim() || providerOpt.defaultModel;
  const defaultPricing = pricingData
    ? (pricingData.models?.[effectiveModel] ||
       Object.entries(pricingData.models || {}).find(([k]) => effectiveModel.includes(k))?.[1])
    : lookupPricing(effectiveModel);
  const customPricing = pricingData?.custom?.[effectiveModel];

  useEffect(() => {
    if (customPricing) {
      setPriceInput(String(customPricing.input));
      setPriceCached(String(customPricing.cached));
      setPriceOutput(String(customPricing.output));
    } else {
      setPriceInput("");
      setPriceCached("");
      setPriceOutput("");
    }
  }, [effectiveModel, pricingData]);

  if (!isOpen) return null;

  const updateCurrentConfig = (field: 'apiKey' | 'model' | 'baseUrl', value: string) => {
    setProviderConfigs(prev => ({
      ...prev,
      [selectedProvider]: {
        ...prev[selectedProvider] || { apiKey: '', model: '', baseUrl: '' },
        [field]: value,
      },
    }));
  };

  const handleTabSelect = (tab: AIProvider | 'search') => {
    setSelectedTab(tab);
    setShowApiKey(false);
    setShowTavilyKey(false);
    setSaveStatus(null);
  };

  const handleSave = async () => {
    try {
      const cfg = providerConfigs[selectedProvider] || { apiKey: '', model: '', baseUrl: '' };
      await fetchOk('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeProvider,
          provider: selectedProvider,
          apiKey: cfg.apiKey,
          model: cfg.model,
          baseUrl: cfg.baseUrl,
          tavilyApiKey,
        }),
      }, 'Failed to save settings');

      // Save custom pricing if any field is filled
      if (priceInput || priceCached || priceOutput) {
        const base = defaultPricing || { input: 2.0, cached: 0.5, output: 8.0 };
        await fetchOk('/api/pricing/custom', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: effectiveModel,
            input: priceInput ? Number(priceInput) : base.input,
            cached: priceCached ? Number(priceCached) : base.cached,
            output: priceOutput ? Number(priceOutput) : base.output,
          }),
        }, 'Failed to save pricing');
      }

      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus('error');
    }
  };

  const isZh = language === 'zh';
  const hasKey = Boolean(currentCfg.apiKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1c1c1e] border border-[#2e2e30] rounded-2xl w-full max-w-[720px] shadow-2xl overflow-hidden flex flex-col" style={{ height: 'min(580px, 90vh)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e2e30] shrink-0">
          <h2 className="text-lg font-bold text-white">{t('settings.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body: Left sidebar + Right detail */}
        <div className="flex flex-1 min-h-0">

          {/* Left: Provider list */}
          <div className="w-[180px] border-r border-[#2e2e30] overflow-y-auto custom-scrollbar shrink-0 py-2">
            {PROVIDER_OPTIONS.map(opt => {
              const cfg = providerConfigs[opt.value];
              const configured = Boolean(cfg?.apiKey);
              return (
                <button
                  key={opt.value}
                  onClick={() => handleTabSelect(opt.value)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                    selectedTab === opt.value
                      ? 'bg-blue-600/15 text-blue-400 border-r-2 border-blue-500'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {configured && (
                    <CircleDot size={10} className="text-green-500 shrink-0" />
                  )}
                </button>
              );
            })}
            <div className="border-t border-[#2e2e30] my-2" />
            <button
              onClick={() => handleTabSelect('search')}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                selectedTab === 'search'
                  ? 'bg-blue-600/15 text-blue-400 border-r-2 border-blue-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              <span className="flex items-center gap-2 truncate"><Search size={14} /> {isZh ? '搜索' : 'Search'}</span>
              {Boolean(tavilyApiKey) && (
                <CircleDot size={10} className="text-green-500 shrink-0" />
              )}
            </button>
          </div>

          {/* Right: Detail panel */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">

            {selectedTab === 'search' ? (
            <>
            {/* Search config */}
            <div>
              <h3 className="text-base font-semibold text-white">{isZh ? '搜索代理' : 'Search Agent'}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {isZh
                  ? '配置后，AI 会自动搜索网络获取最新信息来生成更准确的幻灯片'
                  : 'When configured, AI will automatically search the web for up-to-date info to create more accurate slides'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm text-gray-300 flex items-center gap-2">
                <Key size={14} /> Tavily API Key
              </label>
              <div className="relative">
                <input
                  type={showTavilyKey ? "text" : "password"}
                  value={tavilyApiKey}
                  onChange={e => setTavilyApiKey(e.target.value)}
                  placeholder="tvly-..."
                  className="w-full bg-black/30 border border-[#2e2e30] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowTavilyKey(!showTavilyKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showTavilyKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {Boolean(tavilyApiKey) && (
                <p className="text-xs text-green-500/70">{isZh ? '已配置' : 'Configured'}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {isZh ? '获取 API Key: tavily.com' : 'Get an API key at tavily.com'}
              </p>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <p className="text-xs text-emerald-300/80 leading-relaxed">
                {isZh
                  ? '搜索代理会在生成幻灯片前自动决定是否需要联网搜索。搜索结果会保存在项目中，后续编辑时可以复用。'
                  : 'The search agent automatically decides whether to search the web before generating slides. Results are saved per project and reused during subsequent edits.'}
              </p>
            </div>
            </>
            ) : (
            <>
            {/* Provider header */}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">{providerOpt.label}</h3>
                {providerOpt.info && (
                  <div className="relative group">
                    <Info size={14} className="text-gray-500 cursor-help" />
                    <div className="absolute top-full left-0 mt-1 w-72 p-3 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20 shadow-xl">
                      {isZh ? providerOpt.infoZh : providerOpt.info}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {isZh ? providerOpt.descZh : providerOpt.description}
              </p>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="block text-sm text-gray-300 flex items-center gap-2">
                <Key size={14} /> {t('settings.apiKey')}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={currentCfg.apiKey}
                  onChange={(e) => updateCurrentConfig('apiKey', e.target.value)}
                  className="w-full bg-black/30 border border-[#2e2e30] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors pr-10 text-sm"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {hasKey && (
                <p className="text-xs text-green-500/70">
                  {isZh ? '已配置' : 'Configured'}
                </p>
              )}
            </div>

            {/* Model Name */}
            <div className="space-y-1.5">
              <label className="block text-sm text-gray-300 flex items-center gap-2">
                <Cpu size={14} /> {t('settings.modelName')}
              </label>
              <input
                type="text"
                value={currentCfg.model}
                onChange={(e) => updateCurrentConfig('model', e.target.value)}
                className="w-full bg-black/30 border border-[#2e2e30] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                placeholder={providerOpt.defaultModel}
              />
              <p className="text-xs text-gray-500">
                {isZh ? '留空使用默认：' : 'Default:'} {providerOpt.defaultModel}
              </p>
            </div>

            {/* Base URL */}
            <div className="space-y-1.5">
              <label className="block text-sm text-gray-300 flex items-center gap-2">
                <Globe size={14} /> {t('settings.baseUrl')}
              </label>
              <input
                type="text"
                value={currentCfg.baseUrl}
                onChange={(e) => updateCurrentConfig('baseUrl', e.target.value)}
                className="w-full bg-black/30 border border-[#2e2e30] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                placeholder={providerOpt.defaultBaseUrl}
              />
              <p className="text-xs text-gray-500">
                {isZh ? '留空使用默认：' : 'Default:'} {providerOpt.defaultBaseUrl}
              </p>
            </div>

            {/* Pricing */}
            <div className="space-y-2">
              <label className="block text-sm text-gray-300 flex items-center gap-2">
                <DollarSign size={14} /> {t('settings.pricing')}
              </label>
              <p className="text-xs text-gray-500">{t('settings.pricingHint')}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="block text-xs text-gray-500">{t('settings.priceInput')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="w-full bg-black/30 border border-[#2e2e30] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder={defaultPricing ? String(defaultPricing.input) : "2.00"}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-gray-500">{t('settings.priceCached')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceCached}
                    onChange={(e) => setPriceCached(e.target.value)}
                    className="w-full bg-black/30 border border-[#2e2e30] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder={defaultPricing ? String(defaultPricing.cached) : "0.50"}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-gray-500">{t('settings.priceOutput')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceOutput}
                    onChange={(e) => setPriceOutput(e.target.value)}
                    className="w-full bg-black/30 border border-[#2e2e30] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder={defaultPricing ? String(defaultPricing.output) : "8.00"}
                  />
                </div>
              </div>
            </div>

            {/* Caching info */}
            {providerOpt.cachingInfo && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-300/80 leading-relaxed">
                  {isZh ? providerOpt.cachingInfoZh : providerOpt.cachingInfo}
                </p>
              </div>
            )}
            </>
            )}

            {/* Save Button */}
            <div className="pt-1">
              <button
                onClick={handleSave}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {t('common.save')}
              </button>

              {saveStatus === 'success' && (
                <p className="text-green-500 text-xs flex items-center gap-1 justify-center mt-2">
                  <Check size={12}/> {t('settings.savedSuccess')}
                </p>
              )}
              {saveStatus === 'error' && (
                <p className="text-red-500 text-xs flex items-center gap-1 justify-center mt-2">
                  <AlertCircle size={12}/> {t('settings.savedError')}
                </p>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
