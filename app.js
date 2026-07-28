/* ===========================================================
   Neural Archive — 个人 AI 记忆空间
   核心：本地优先 · 用户自有模型 · 记忆沉淀 · 画像还原
   =========================================================== */

(function () {
  "use strict";

  /* ========================================================
     1. 常量与预设
     ======================================================== */
  const STORAGE_KEY = "neural_archive_v1";
  const SCHEMA = "neural-archive-profile/v1";
  const APP_NAME = "Neural Archive";
  const APP_VERSION = "1.0.0";

  const LLM_PRESETS = {
    custom:      { baseUrl: "",                       model: "" },
    openai:      { baseUrl: "https://api.openai.com/v1",            model: "gpt-4o-mini" },
    deepseek:    { baseUrl: "https://api.deepseek.com/v1",          model: "deepseek-chat" },
    moonshot:    { baseUrl: "https://api.moonshot.cn/v1",           model: "moonshot-v1-8k" },
    zhipu:       { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
    dashscope:   { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo" },
    ollama:      { baseUrl: "http://localhost:11434/v1",            model: "llama3.1" },
    openrouter:  { baseUrl: "https://openrouter.ai/api/v1",         model: "openai/gpt-4o-mini" },
    siliconflow: { baseUrl: "https://api.siliconflow.cn/v1",        model: "Qwen/Qwen2.5-7B-Instruct" },
  };

  const DEFAULT_SYSTEM_PROMPT = `你是用户的私人 AI 伴侣与记忆管家，名叫 {name}。
你的性格基调是 {tone}。你会用心倾听、记住用户告诉你的每一个细节，并在合适的时机自然地提及。
当用户分享事实、偏好、计划、情绪时，你会简洁回应，不要过度表演。
你可以主动关心用户，但不过分打扰。回复保持自然、有温度、不啰嗦。`;

  const MEMORY_TYPES = [
    { key: "fact",        label: "事实" },
    { key: "preference",  label: "偏好" },
    { key: "event",       label: "事件" },
    { key: "emotion",     label: "情绪" },
    { key: "relationship",label: "关系" },
    { key: "goal",        label: "目标" },
    { key: "health",      label: "健康" },
    { key: "other",       label: "其他" },
  ];

  // 画像维度（雷达图）
  const PROFILE_DIMENSIONS = [
    { key: "basic",        label: "基础属性" },
    { key: "personality",  label: "性格" },
    { key: "interest",     label: "兴趣" },
    { key: "preference",   label: "偏好" },
    { key: "health",       label: "健康" },
    { key: "social",       label: "社交" },
    { key: "value",        label: "价值观" },
    { key: "goal",         label: "目标" },
  ];

  /* ========================================================
     2. 存储层（localStorage 抽象）
     ======================================================== */
  const Store = {
    data: null,
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        this.data = raw ? JSON.parse(raw) : null;
      } catch (e) { this.data = null; }
      if (!this.data) this.data = this._default();
      // 兼容补齐
      if (!this.data.conversations) this.data.conversations = [];
      if (!this.data.memories) this.data.memories = [];
      if (!this.data.profile) this.data.profile = this._defaultProfile();
      if (!this.data.settings) this.data.settings = this._defaultSettings();
      if (!this.data.settings.llm) this.data.settings.llm = this._defaultSettings().llm;
      if (!this.data.settings.persona) this.data.settings.persona = this._defaultSettings().persona;
      if (!this.data.settings.memory) this.data.settings.memory = this._defaultSettings().memory;
      return this.data;
    },
    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    },
    _default() {
      return {
        conversations: [],
        memories: [],
        profile: this._defaultProfile(),
        settings: this._defaultSettings(),
        meta: { createdAt: Date.now(), version: APP_VERSION },
      };
    },
    _defaultProfile() {
      return {
        basic: {},          // {name, age, gender, occupation, location, ...}
        personality: {},    // {mbti, traits:{openness,conscientiousness,extraversion,agreeableness,neuroticism}}
        interests: [],      // [{tag, weight}]
        preferences: {},    // {food, music, movie, ...}
        values: [],
        goals: [],
        relationships: [],
        health: {},
        updatedAt: null,
      };
    },
    _defaultSettings() {
      return {
        llm: {
          provider: "custom",
          baseUrl: "",
          apiKey: "",
          model: "",
          temperature: 0.7,
          maxTokens: 2048,
          systemPrompt: "",
        },
        persona: {
          name: "Aria",
          avatar: "A",
          tone: "温柔共情",
          accent: "amber",
        },
        memory: {
          autoExtract: true,
          llmExtract: true,
          stream: true,
          injectCount: 12,
        },
      };
    },
  };

  /* ========================================================
     3. 工具函数
     ======================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
    if (diff < 604800000) return Math.floor(diff / 86400000) + " 天前";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function escapeHTML(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // 极简 markdown 渲染（段落 / 代码块 / 行内代码 / 加粗 / 换行）
  function renderMarkdown(text) {
    if (!text) return "";
    let s = escapeHTML(text);
    // 代码块
    s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.replace(/^\n/, "")}</code></pre>`);
    // 行内代码
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    // 加粗
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // 段落
    const paras = s.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br/>")}</p>`);
    return paras.join("");
  }

  function toast(msg, type = "") {
    const wrap = $("#toastWrap");
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  /* ========================================================
     4. LLM 客户端（OpenAI 兼容 /chat/completions）
     ======================================================== */
  const LLM = {
    config() { return Store.data.settings.llm; },
    isReady() {
      const c = this.config();
      return !!(c.baseUrl && c.model);
    },
    _headers() {
      const c = this.config();
      const h = { "Content-Type": "application/json" };
      if (c.apiKey) h["Authorization"] = "Bearer " + c.apiKey;
      return h;
    },
    // 流式对话；onDelta(text)；返回完整文本
    async chat(messages, { stream, onDelta, signal } = {}) {
      const c = this.config();
      if (!this.isReady()) throw new Error("尚未配置大模型（Base URL / 模型）");
      const url = c.baseUrl.replace(/\/$/, "") + "/chat/completions";
      const body = {
        model: c.model,
        messages,
        temperature: Number(c.temperature) || 0.7,
        max_tokens: Number(c.maxTokens) || 2048,
        stream: !!stream,
      };
      const resp = await fetch(url, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify(body),
        signal,
      });
      if (!resp.ok) {
        let detail = "";
        try { detail = (await resp.text()).slice(0, 300); } catch (e) {}
        throw new Error(`HTTP ${resp.status} ${resp.statusText} ${detail}`);
      }
      if (!stream) {
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || "";
      }
      // 流式解析
      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "", full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t || !t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) { full += delta; onDelta && onDelta(delta); }
          } catch (e) { /* 忽略单行解析错误 */ }
        }
      }
      return full;
    },
    // 非流式便捷调用
    async complete(messages, signal) {
      return this.chat(messages, { stream: false, signal });
    },
  };

  /* ========================================================
     5. 记忆系统
     ======================================================== */
  const Memory = {
    all() { return Store.data.memories; },
    add(mem) {
      const m = Object.assign({
        id: uid("mem"),
        type: "other",
        content: "",
        tags: [],
        source: "manual",
        conversationId: null,
        confidence: 0.8,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, mem);
      Store.data.memories.unshift(m);
      Store.save();
      return m;
    },
    update(id, patch) {
      const m = Store.data.memories.find(x => x.id === id);
      if (!m) return;
      Object.assign(m, patch, { updatedAt: Date.now() });
      Store.save();
    },
    remove(id) {
      Store.data.memories = Store.data.memories.filter(x => x.id !== id);
      Store.save();
    },
    clear() { Store.data.memories = []; Store.save(); },

    // 用于注入上下文的记忆（按相关度/近期排序，取前 N 条）
    forContext(count) {
      const mems = Store.data.memories.slice();
      // 简单策略：近期 + 高置信 优先
      mems.sort((a, b) => (b.confidence - a.confidence) || (b.updatedAt - a.updatedAt));
      return mems.slice(0, count || 12);
    },

    // 从一段对话提取记忆（LLM 或本地规则）
    async extractFromConversation(conv) {
      const userMsgs = conv.messages.filter(m => m.role === "user").map(m => m.content);
      if (!userMsgs.length) return [];
      const settings = Store.data.settings.memory;
      let extracted = [];
      if (settings.llmExtract && LLM.isReady()) {
        extracted = await this._extractWithLLM(userMsgs);
      } else {
        extracted = this._extractLocal(userMsgs);
      }
      // 去重（内容相似则跳过）
      const exist = Store.data.memories.map(m => m.content);
      const added = [];
      for (const e of extracted) {
        if (!e.content || e.content.length < 4) continue;
        if (exist.some(c => c.includes(e.content) || e.content.includes(c))) continue;
        const m = this.add(Object.assign({ source: "conversation", conversationId: conv.id }, e));
        added.push(m);
        exist.push(e.content);
      }
      return added;
    },

    async _extractWithLLM(userMsgs) {
      const sys = `你是一个记忆提取器。从用户的对话片段中，提取值得长期记住的事实、偏好、事件、情绪、关系、目标、健康信息。
仅输出 JSON 数组，每个元素：{"type":"fact|preference|event|emotion|relationship|goal|health|other","content":"简洁陈述句（第三人称描述用户）","tags":["标签"],"confidence":0.0-1.0}
不要提取寒暄、无意义内容。若无可提取，返回 []。只输出 JSON，不要任何解释。`;
      const userText = userMsgs.map((t, i) => `[${i + 1}] ${t}`).join("\n");
      try {
        const out = await LLM.complete([
          { role: "system", content: sys },
          { role: "user", content: userText },
        ]);
        const json = this._parseJSON(out);
        if (Array.isArray(json)) return json.filter(x => x.content);
      } catch (e) { /* 降级到本地 */ }
      return this._extractLocal(userMsgs);
    },

    _parseJSON(text) {
      if (!text) return null;
      // 提取首个 [ ... ] 或 { ... }
      const m = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      const candidate = m ? m[0] : text;
      try { return JSON.parse(candidate); } catch (e) {}
      // 尝试修复常见问题
      try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1")); } catch (e) {}
      return null;
    },

    // 本地规则提取（无 LLM 时的兜底）
    _extractLocal(userMsgs) {
      const results = [];
      const text = userMsgs.join("\n");
      const patterns = [
        { re: /我叫([^\s,，。.!！?？]{1,10})/g, type: "fact", tag: "姓名", fmt: m => `用户名叫${m[1]}` },
        { re: /我是([^\s,，。.!！?？]{1,12}?(?:工程师|设计师|产品经理|开发|程序员|学生|老师|医生|律师|经理|分析师|运营|编辑|记者|摄影师|作家|创业者|自由职业))/g, type: "fact", tag: "职业", fmt: m => `用户是${m[1]}` },
        { re: /在([北京上海广州深圳杭州成都武汉南京西安重庆天津苏州长沙青岛大连厦门哈尔滨][^\s,，。.!！?？]{0,8})/g, type: "fact", tag: "地点", fmt: m => `用户在${m[1]}` },
        { re: /我喜欢([^\s,，。.!！?？]{2,20})/g, type: "preference", tag: "喜好", fmt: m => `用户喜欢${m[1]}` },
        { re: /我不喜欢|我讨厌([^\s,，。.!！?？]{2,20})/g, type: "preference", tag: "厌恶", fmt: m => `用户不喜欢${m[1]}` },
        { re: /下周|下周三|下周四|明天|后天|今天下午|今天晚上([^\s,，。.!！?？]{2,30})/g, type: "event", tag: "日程", fmt: m => `用户有安排：${m[0]}` },
        { re: /我的目标是|我想成为|我打算([^\s,，。.!！?？]{2,40})/g, type: "goal", tag: "目标", fmt: m => `用户目标：${m[1] || m[0]}` },
        { re: /我的(女朋友|男朋友|老婆|丈夫|先生|太太|爸爸|妈妈|儿子|女儿|朋友|同事)是?([^\s,，。.!！?？]{1,10})/g, type: "relationship", tag: "关系", fmt: m => `用户的${m[1]}：${m[2]}` },
        { re: /我(?:最近)?(?:压力|焦虑|开心|难过|沮丧|兴奋|疲惫|累|郁闷|生气)([^\s,，。.!！?？]{0,20})/g, type: "emotion", tag: "情绪", fmt: m => `用户情绪：${m[0]}` },
        { re: /体检|吃药|失眠|胃痛|头疼|感冒|过敏|健身|跑步|减肥([^\s,，。.!！?？]{0,20})/g, type: "health", tag: "健康", fmt: m => `健康相关：${m[0]}` },
      ];
      for (const p of patterns) {
        let m;
        while ((m = p.re.exec(text)) !== null) {
          results.push({
            type: p.type,
            content: p.fmt(m).replace(/\s+/g, " ").trim(),
            tags: [p.tag],
            confidence: 0.7,
          });
          if (results.length > 20) break;
        }
      }
      return results;
    },
  };

  /* ========================================================
     6. 画像系统
     ======================================================== */
  const Profile = {
    get() { return Store.data.profile; },

    // 从记忆重新聚合画像
    rebuild() {
      const p = Store.data.profile;
      const mems = Store.data.memories;
      // 基础属性
      p.basic = p.basic || {};
      // 性格 trait 统计（情绪类记忆推断）
      p.personality = p.personality || {};
      // 兴趣/偏好（从 preference 类型聚合）
      const interestMap = {};
      const prefMap = {};
      const values = [];
      const goals = [];
      const relationships = [];
      const facts = [];
      const health = {};

      for (const m of mems) {
        const c = m.content || "";
        if (m.type === "fact") facts.push(c);
        if (m.type === "preference") {
          // 尝试从标签/内容提取主题
          const tag = (m.tags && m.tags[0]) || "其他";
          if (tag === "喜好" || tag === "厌恶") {
            interestMap[c] = (interestMap[c] || 0) + 1;
          } else {
            prefMap[tag] = prefMap[tag] || [];
            if (!prefMap[tag].includes(c)) prefMap[tag].push(c);
          }
        }
        if (m.type === "goal") goals.push(c);
        if (m.type === "relationship") relationships.push(c);
        if (m.type === "emotion") {
          // 简单情绪倾向统计
          if (/焦虑|压力|累|郁闷|难过/.test(c)) health.stress = (health.stress || 0) + 1;
          if (/开心|兴奋|愉快/.test(c)) health.positive = (health.positive || 0) + 1;
        }
        if (m.type === "health") {
          if (/失眠|睡眠/.test(c)) health.sleep = c;
          else if (/健身|跑步|运动/.test(c)) health.exercise = c;
          else health.notes = (health.notes ? health.notes + "；" : "") + c;
        }
        if (m.type === "other" && /价值观|相信|认为人生/.test(c)) values.push(c);
      }

      // 从 facts 提取基础属性
      for (const f of facts) {
        const nameM = f.match(/叫(.{1,8})/) || f.match(/姓名[^:：]*[:：]?\s*(.{1,8})/);
        if (nameM && !p.basic.name) p.basic.name = nameM[1].trim();
        const occM = f.match(/(工程师|设计师|产品经理|开发|程序员|学生|老师|医生|律师|经理|分析师|运营|摄影师|作家|创业者|自由职业)/);
        if (occM && !p.basic.occupation) p.basic.occupation = occM[1];
        const locM = f.match(/在(北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|重庆|天津|苏州|长沙|青岛|大连|厦门|哈尔滨)/);
        if (locM && !p.basic.location) p.basic.location = locM[1];
        const ageM = f.match(/(\d{1,2})\s*岁/);
        if (ageM && !p.basic.age) p.basic.age = Number(ageM[1]);
      }

      // 兴趣数组
      p.interests = Object.entries(interestMap)
        .map(([tag, weight]) => ({ tag, weight }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 20);
      p.preferences = prefMap;
      p.values = values;
      p.goals = goals;
      p.relationships = relationships;
      p.health = Object.assign(p.health || {}, health);
      p.facts = facts;
      p.updatedAt = Date.now();
      Store.save();
      return p;
    },

    // 各维度完成度（0-1）用于雷达图
    dimensionScores() {
      const p = this.get();
      const score = (obj) => {
        if (!obj) return 0;
        if (Array.isArray(obj)) return Math.min(1, obj.length / 5);
        const keys = Object.keys(obj).filter(k => obj[k] !== undefined && obj[k] !== "" && obj[k] !== null);
        return Math.min(1, keys.length / 4);
      };
      return {
        basic: score(p.basic),
        personality: score(p.personality),
        interest: Math.min(1, (p.interests || []).length / 8),
        preference: score(p.preferences),
        health: score(p.health),
        social: Math.min(1, (p.relationships || []).length / 3),
        value: Math.min(1, (p.values || []).length / 3),
        goal: Math.min(1, (p.goals || []).length / 3),
      };
    },

    // 生成画像摘要文本（用于注入系统提示或导出）
    summary() {
      const p = this.get();
      const lines = [];
      if (p.basic && p.basic.name) lines.push(`姓名：${p.basic.name}`);
      if (p.basic && p.basic.age) lines.push(`年龄：${p.basic.age}`);
      if (p.basic && p.basic.occupation) lines.push(`职业：${p.basic.occupation}`);
      if (p.basic && p.basic.location) lines.push(`所在地：${p.basic.location}`);
      if (p.interests && p.interests.length) {
        lines.push("兴趣：" + p.interests.slice(0, 8).map(i => i.tag.replace(/^用户喜欢/, "").replace(/^用户不喜欢/, "[否]").trim()).join("、"));
      }
      if (p.goals && p.goals.length) lines.push("目标：" + p.goals.slice(0, 3).join("；"));
      if (p.relationships && p.relationships.length) lines.push("关系：" + p.relationships.slice(0, 3).join("；"));
      if (p.health) {
        const h = [];
        if (p.health.sleep) h.push("睡眠:" + p.health.sleep);
        if (p.health.exercise) h.push("运动:" + p.health.exercise);
        if (h.length) lines.push("健康：" + h.join("，"));
      }
      return lines.join("\n");
    },
  };

  /* ========================================================
     7. 对话管理
     ======================================================== */
  const Chat = {
    currentId: null,
    sending: false,
    abortCtrl: null,

    list() { return Store.data.conversations; },
    get(id) { return Store.data.conversations.find(c => c.id === id); },
    current() { return this.currentId ? this.get(this.currentId) : null; },

    create() {
      const conv = {
        id: uid("conv"),
        title: "新的对话",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      Store.data.conversations.unshift(conv);
      Store.save();
      this.currentId = conv.id;
      return conv;
    },
    select(id) { this.currentId = id; Store.save(); },
    remove(id) {
      Store.data.conversations = Store.data.conversations.filter(c => c.id !== id);
      if (this.currentId === id) this.currentId = Store.data.conversations[0]?.id || null;
      Store.save();
    },
    clearCurrent() {
      const c = this.current();
      if (!c) return;
      c.messages = [];
      c.title = "新的对话";
      c.updatedAt = Date.now();
      Store.save();
    },

    addMessage(role, content) {
      let c = this.current();
      if (!c) c = this.create();
      const msg = { role, content, timestamp: Date.now() };
      c.messages.push(msg);
      c.updatedAt = Date.now();
      // 自动标题：首条用户消息前 20 字
      if (role === "user" && (c.title === "新的对话" || !c.title)) {
        c.title = content.slice(0, 22).replace(/\n/g, " ") + (content.length > 22 ? "…" : "");
      }
      Store.save();
      return msg;
    },

    // 构建发送给 LLM 的 messages（系统提示 + 画像 + 记忆 + 历史）
    buildPayload() {
      const c = this.current();
      if (!c) return [];
      const s = Store.data.settings;
      const persona = s.persona;
      const llm = s.llm;
      const mem = s.memory;

      const sysPrompt = (llm.systemPrompt || DEFAULT_SYSTEM_PROMPT)
        .replace(/\{name\}/g, persona.name)
        .replace(/\{tone\}/g, persona.tone);

      const profileSummary = Profile.summary();
      const memories = Memory.forContext(mem.injectCount || 12);

      const sysContent = [
        sysPrompt,
        profileSummary ? `\n# 用户画像\n${profileSummary}` : "",
        memories.length ? `\n# 长期记忆（请自然参考，勿机械复述）\n${memories.map((m, i) => `- [${m.type}] ${m.content}`).join("\n")}` : "",
      ].join("");

      const payload = [{ role: "system", content: sysContent }];
      // 历史消息（最近 20 条）
      const history = c.messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
      payload.push(...history);
      return payload;
    },

    async send(text) {
      if (!text.trim() || this.sending) return;
      if (!LLM.isReady()) {
        toast("请先在「设置」中配置大模型", "err");
        App.switchView("settings");
        return;
      }
      // 确保有会话
      if (!this.current()) this.create();
      this.addMessage("user", text);
      UI.renderMessages();
      UI.renderConvList();
      UI.clearInput();

      // 添加 assistant 占位
      const placeholder = this.addMessage("assistant", "");
      UI.renderMessages();
      UI.showThinking(placeholder);
      UI.setSending(true);
      this.sending = true;
      this.abortCtrl = new AbortController();

      const settings = Store.data.settings.memory;
      const messages = this.buildPayload();
      // 移除最后一条空的 assistant（让 API 重生成）
      messages.push({ role: "user", content: text });

      let acc = "";
      try {
        if (settings.stream) {
          await LLM.chat(messages, {
            stream: true,
            signal: this.abortCtrl.signal,
            onDelta: (delta) => {
              acc += delta;
              UI.updateStreamingMessage(placeholder, acc);
            },
          });
        } else {
          acc = await LLM.complete(messages, this.abortCtrl.signal);
          UI.updateStreamingMessage(placeholder, acc);
        }
        // 写回
        const c = this.current();
        const msg = c.messages.find(m => m === placeholder);
        if (msg) { msg.content = acc; Store.save(); }
        UI.finishStreaming(placeholder);
      } catch (e) {
        const errMsg = e.name === "AbortError" ? "（已中断）" : ("⚠ " + (e.message || "请求失败"));
        const c = this.current();
        const msg = c.messages.find(m => m === placeholder);
        if (msg) { msg.content = errMsg; Store.save(); }
        UI.renderMessages();
        if (e.name !== "AbortError") toast("请求失败：" + e.message, "err");
      } finally {
        this.sending = false;
        this.abortCtrl = null;
        UI.setSending(false);
        UI.updateTokenHint();

        // 自动提取记忆
        if (settings.autoExtract && acc) {
          this._maybeExtract();
        }
      }
    },

    _maybeExtract() {
      // 节流：每 2 条用户消息提取一次
      const c = this.current();
      if (!c) return;
      const userCount = c.messages.filter(m => m.role === "user").length;
      if (userCount === 0 || userCount % 2 !== 0) return;
      Memory.extractFromConversation(c).then(added => {
        if (added.length) {
          toast(`沉淀了 ${added.length} 条新记忆`, "ok");
          UI.updateMemBadge();
          UI.renderMemStats();
          // 重新聚合画像
          Profile.rebuild();
        }
      }).catch(() => {});
    },
  };

  /* ========================================================
     8. UI 层
     ======================================================== */
  const UI = {
    init() {
      this.bindNav();
      this.bindChat();
      this.bindMemory();
      this.bindProfile();
      this.bindSettings();
      this.bindExport();
      this.bindModal();
      this.applyAccent();
      this.applyPersona();
      this.updateConnStatus();
      this.renderAll();
    },

    renderAll() {
      this.renderConvList();
      this.renderMessages();
      this.updateMemBadge();
      this.renderMemStats();
      this.renderMemFilters();
      this.renderMemGrid();
      this.renderProfile();
      this.renderExportStats();
      this.renderSchemaPreview();
      this.fillSettingsForm();
      this.updateTokenHint();
    },

    /* ---- 导航 ---- */
    bindNav() {
      $$(".nav-item").forEach(btn => {
        btn.addEventListener("click", () => {
          App.switchView(btn.dataset.view);
        });
      });
      $("#personaChip").addEventListener("click", () => App.switchView("settings"));
    },

    /* ---- 对话 ---- */
    bindChat() {
      $("#newConvBtn").addEventListener("click", () => {
        Chat.create();
        this.renderConvList();
        this.renderMessages();
        $("#msgInput").focus();
      });
      $("#clearConvBtn").addEventListener("click", () => {
        if (!confirm("清空当前会话的所有消息？")) return;
        Chat.clearCurrent();
        this.renderMessages();
        this.renderConvList();
      });
      $("#extractMemBtn").addEventListener("click", async () => {
        const c = Chat.current();
        if (!c || !c.messages.length) { toast("当前会话为空", "err"); return; }
        toast("正在提取记忆…");
        try {
          const added = await Memory.extractFromConversation(c);
          toast(added.length ? `沉淀了 ${added.length} 条记忆` : "未发现新记忆", added.length ? "ok" : "");
          this.updateMemBadge();
          this.renderMemStats();
          this.renderMemGrid();
          if (added.length) { Profile.rebuild(); this.renderProfile(); }
        } catch (e) { toast("提取失败：" + e.message, "err"); }
      });

      const input = $("#msgInput");
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(160, input.scrollHeight) + "px";
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          Chat.send(input.value);
        }
      });
      $("#sendBtn").addEventListener("click", () => Chat.send(input.value));

      // 建议气泡
      $$(".suggest-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          input.value = chip.dataset.prompt;
          input.focus();
          input.dispatchEvent(new Event("input"));
        });
      });
    },

    renderConvList() {
      const list = $("#convList");
      const convs = Chat.list();
      if (!convs.length) {
        list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--fg-mute);font-size:12.5px">暂无会话</div>`;
        return;
      }
      list.innerHTML = convs.map(c => `
        <div class="conv-item ${c.id === Chat.currentId ? "active" : ""}" data-id="${c.id}">
          <button class="conv-item-del" data-del="${c.id}" title="删除">✕</button>
          <div class="conv-item-title">${escapeHTML(c.title)}</div>
          <div class="conv-item-meta">
            <span>${fmtDate(c.updatedAt)}</span>
            <span>${c.messages.length} 条</span>
          </div>
        </div>
      `).join("");
      list.querySelectorAll(".conv-item").forEach(el => {
        el.addEventListener("click", (e) => {
          if (e.target.dataset.del) return;
          Chat.select(el.dataset.id);
          this.renderConvList();
          this.renderMessages();
        });
      });
      list.querySelectorAll(".conv-item-del").forEach(b => {
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!confirm("删除此会话？")) return;
          Chat.remove(b.dataset.del);
          this.renderConvList();
          this.renderMessages();
        });
      });
    },

    renderMessages() {
      const wrap = $("#messages");
      const c = Chat.current();
      if (!c || !c.messages.length) {
        wrap.innerHTML = `
          <div class="empty-state" id="chatEmpty">
            <div class="empty-orb"></div>
            <h3>开始一段对话</h3>
            <p>每一句话都会沉淀为你的记忆。<br/>越聊，AI 越懂你。</p>
            <div class="suggest-row">
              <button class="suggest-chip" data-prompt="今天过得怎么样？">今天过得怎么样？</button>
              <button class="suggest-chip" data-prompt="帮我记一下，我下周三要体检">下周三要体检</button>
              <button class="suggest-chip" data-prompt="我最近压力有点大，想聊聊">我最近压力有点大</button>
              <button class="suggest-chip" data-prompt="更新我的画像：我是产品经理，喜欢摄影">更新我的画像</button>
            </div>
          </div>`;
        $$(".suggest-chip", wrap).forEach(chip => {
          chip.addEventListener("click", () => {
            $("#msgInput").value = chip.dataset.prompt;
            $("#msgInput").focus();
          });
        });
        $("#chatTitle").textContent = "新的对话";
        $("#chatMeta").textContent = "";
        return;
      }
      $("#chatTitle").textContent = c.title;
      $("#chatMeta").textContent = `${c.messages.length} 条消息 · ${fmtDate(c.updatedAt)}`;
      const persona = Store.data.settings.persona;
      wrap.innerHTML = c.messages.map(m => this._msgHTML(m, persona)).join("");
      wrap.scrollTop = wrap.scrollHeight;
    },

    _msgHTML(m, persona) {
      const isUser = m.role === "user";
      const avatar = isUser ? "你" : (persona.avatar || persona.name.slice(0, 1));
      const cls = isUser ? "user" : "assistant";
      const streaming = m.role === "assistant" && !m.content ? " streaming" : "";
      const inner = m.content
        ? renderMarkdown(m.content)
        : `<div class="thinking"><span></span><span></span><span></span></div>`;
      return `
        <div class="msg ${cls}">
          <div class="msg-avatar">${escapeHTML(avatar)}</div>
          <div>
            <div class="msg-bubble${streaming}">${inner}</div>
            <div class="msg-time">${fmtTime(m.timestamp)}</div>
          </div>
        </div>`;
    },

    showThinking(placeholder) {
      // 已在 renderMessages 中渲染 thinking；这里只滚动
      const wrap = $("#messages");
      wrap.scrollTop = wrap.scrollHeight;
    },
    updateStreamingMessage(placeholder, text) {
      const wrap = $("#messages");
      const msgs = wrap.querySelectorAll(".msg.assistant");
      const c = Chat.current();
      const idx = c.messages.indexOf(placeholder);
      if (idx < 0) return;
      // 对应 DOM：assistant 消息在 user 之后；简单按 idx 映射
      const el = msgs[msgs.length - 1];
      if (!el) return;
      const bubble = el.querySelector(".msg-bubble");
      bubble.classList.add("streaming");
      bubble.innerHTML = renderMarkdown(text);
      wrap.scrollTop = wrap.scrollHeight;
    },
    finishStreaming(placeholder) {
      const wrap = $("#messages");
      const msgs = wrap.querySelectorAll(".msg.assistant");
      const el = msgs[msgs.length - 1];
      if (el) el.querySelector(".msg-bubble").classList.remove("streaming");
    },
    setSending(sending) {
      $("#sendBtn").disabled = sending;
    },
    clearInput() {
      const input = $("#msgInput");
      input.value = "";
      input.style.height = "auto";
    },
    updateTokenHint() {
      const c = Chat.current();
      const cnt = c ? c.messages.length : 0;
      $("#tokenHint").textContent = `会话 ${cnt} 条`;
      const memCnt = Store.data.memories.length;
      const inject = Store.data.settings.memory.injectCount || 12;
      $("#memHint").textContent = `记忆库 ${memCnt} 条 · 注入 ${Math.min(inject, memCnt)}`;
    },

    /* ---- 记忆 ---- */
    memFilter: "all",
    memSearch: "",
    bindMemory() {
      $("#memSearch").addEventListener("input", (e) => {
        this.memSearch = e.target.value.trim().toLowerCase();
        this.renderMemGrid();
      });
      $("#addMemBtn").addEventListener("click", () => this.openMemoryModal());
    },
    updateMemBadge() {
      $("#memBadge").textContent = Store.data.memories.length;
    },
    renderMemStats() {
      const mems = Store.data.memories;
      const byType = {};
      for (const m of mems) byType[m.type] = (byType[m.type] || 0) + 1;
      const cards = [
        { num: mems.length, label: "记忆总数" },
        { num: Object.keys(byType).length, label: "类型覆盖" },
        { num: mems.filter(m => m.source === "conversation").length, label: "自动沉淀" },
        { num: mems.filter(m => m.source === "manual").length, label: "手动添加" },
      ];
      $("#memStats").innerHTML = cards.map(c => `
        <div class="mem-stat">
          <div class="mem-stat-num">${c.num}</div>
          <div class="mem-stat-label">${c.label}</div>
        </div>`).join("");
    },
    renderMemFilters() {
      const mems = Store.data.memories;
      const counts = { all: mems.length };
      for (const m of mems) counts[m.type] = (counts[m.type] || 0) + 1;
      const chips = [{ key: "all", label: "全部" }, ...MEMORY_TYPES]
        .filter(t => t.key === "all" || counts[t.key])
        .map(t => `<button class="filter-chip ${this.memFilter === t.key ? "active" : ""}" data-f="${t.key}">${t.label}${counts[t.key] ? ` <span style="opacity:.6">${counts[t.key]}</span>` : ""}</button>`);
      $("#memFilters").innerHTML = chips.join("");
      $$("#memFilters .filter-chip").forEach(b => {
        b.addEventListener("click", () => {
          this.memFilter = b.dataset.f;
          this.renderMemFilters();
          this.renderMemGrid();
        });
      });
    },
    renderMemGrid() {
      const grid = $("#memGrid");
      let mems = Store.data.memories.slice();
      if (this.memFilter !== "all") mems = mems.filter(m => m.type === this.memFilter);
      if (this.memSearch) {
        mems = mems.filter(m =>
          (m.content || "").toLowerCase().includes(this.memSearch) ||
          (m.tags || []).some(t => t.toLowerCase().includes(this.memSearch))
        );
      }
      if (!mems.length) {
        grid.innerHTML = `<div class="mem-empty"><h4>暂无记忆</h4><p>去对话中聊聊，或手动添加一条记忆吧。</p></div>`;
        return;
      }
      const typeLabel = (t) => (MEMORY_TYPES.find(x => x.key === t) || { label: t }).label;
      grid.innerHTML = mems.map(m => `
        <div class="mem-card type-${m.type}">
          <div class="mem-card-head">
            <span class="mem-type">${typeLabel(m.type)}</span>
            <span class="mem-time">${fmtTime(m.createdAt)}</span>
          </div>
          <div class="mem-content">${escapeHTML(m.content)}</div>
          ${m.tags && m.tags.length ? `<div class="mem-tags">${m.tags.map(t => `<span class="mem-tag">#${escapeHTML(t)}</span>`).join("")}</div>` : ""}
          <div class="mem-actions">
            <button class="mem-action" data-edit="${m.id}">编辑</button>
            <button class="mem-action danger" data-del="${m.id}">删除</button>
          </div>
        </div>
      `).join("");
      $$("#memGrid [data-edit]").forEach(b => {
        b.addEventListener("click", () => {
          const m = Store.data.memories.find(x => x.id === b.dataset.edit);
          if (m) this.openMemoryModal(m);
        });
      });
      $$("#memGrid [data-del]").forEach(b => {
        b.addEventListener("click", () => {
          if (!confirm("删除此记忆？")) return;
          Memory.remove(b.dataset.del);
          this.updateMemBadge();
          this.renderMemStats();
          this.renderMemFilters();
          this.renderMemGrid();
        });
      });
    },
    openMemoryModal(mem = null) {
      const isEdit = !!mem;
      const body = `
        <div class="field">
          <label>类型</label>
          <select id="memType">${MEMORY_TYPES.map(t => `<option value="${t.key}" ${mem && mem.type === t.key ? "selected" : ""}>${t.label}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>内容</label>
          <textarea id="memContent" rows="4" placeholder="例如：用户喜欢在清晨喝手冲咖啡">${mem ? escapeHTML(mem.content) : ""}</textarea>
        </div>
        <div class="field">
          <label>标签（逗号分隔）</label>
          <input type="text" id="memTags" value="${mem && mem.tags ? mem.tags.join(", ") : ""}" placeholder="咖啡, 早晨, 习惯"/>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" id="memCancel">取消</button>
          <button class="btn-primary" id="memSave">${isEdit ? "保存" : "添加"}</button>
        </div>`;
      Modal.open(isEdit ? "编辑记忆" : "添加记忆", body, () => {
        $("#memCancel").onclick = () => Modal.close();
        $("#memSave").onclick = () => {
          const type = $("#memType").value;
          const content = $("#memContent").value.trim();
          const tags = $("#memTags").value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
          if (!content) { toast("请输入内容", "err"); return; }
          if (isEdit) {
            Memory.update(mem.id, { type, content, tags });
          } else {
            Memory.add({ type, content, tags, source: "manual", confidence: 1.0 });
          }
          Modal.close();
          this.updateMemBadge();
          this.renderMemStats();
          this.renderMemFilters();
          this.renderMemGrid();
          Profile.rebuild();
          this.renderProfile();
          toast(isEdit ? "已更新" : "已添加", "ok");
        };
      });
    },

    /* ---- 画像 ---- */
    bindProfile() {
      $("#rebuildProfileBtn").addEventListener("click", () => {
        Profile.rebuild();
        this.renderProfile();
        toast("画像已重新聚合", "ok");
      });
      $("#editProfileBtn").addEventListener("click", () => this.openProfileModal());
    },
    renderProfile() {
      const p = Profile.get();
      // 身份卡
      const name = p.basic?.name || "未命名用户";
      $("#profileName").textContent = name;
      const tagline = [p.basic?.occupation, p.basic?.location].filter(Boolean).join(" · ") || "尚无画像数据，去对话或添加记忆吧";
      $("#profileTagline").textContent = tagline;

      const meta = [];
      if (p.basic?.age) meta.push(["年龄", p.basic.age]);
      if (p.basic?.gender) meta.push(["性别", p.basic.gender]);
      if (p.basic?.occupation) meta.push(["职业", p.basic.occupation]);
      if (p.basic?.location) meta.push(["所在地", p.basic.location]);
      if (p.personality?.mbti) meta.push(["MBTI", p.personality.mbti]);
      meta.push(["记忆数", Store.data.memories.length]);
      meta.push(["更新", p.updatedAt ? fmtDate(p.updatedAt) : "—"]);
      $("#identityMeta").innerHTML = meta.map(([k, v]) =>
        `<div class="im-row"><span class="im-key">${k}</span><span class="im-val">${escapeHTML(String(v))}</span></div>`).join("");

      // 雷达图
      this.drawRadar();

      // 性格倾向（用维度分数做简单展示）
      const scores = Profile.dimensionScores();
      const traitNames = {
        basic: "基础属性", personality: "性格", interest: "兴趣广度",
        preference: "偏好明确", health: "健康关注", social: "社交活跃", value: "价值观", goal: "目标清晰",
      };
      $("#personalityList").innerHTML = Object.entries(scores).map(([k, v]) => `
        <div class="trait-item">
          <div class="trait-head"><span class="trait-name">${traitNames[k]}</span><span class="trait-val">${Math.round(v * 100)}%</span></div>
          <div class="trait-bar"><div class="trait-fill" style="width:${v * 100}%"></div></div>
        </div>`).join("");

      // 兴趣标签
      const interests = (p.interests || []).slice(0, 16);
      if (interests.length) {
        $("#interestTags").innerHTML = interests.map(i => {
          const tag = i.tag.replace(/^用户喜欢/, "").replace(/^用户不喜欢/, "[否] ").trim();
          return `<span class="tag-pill">${escapeHTML(tag)}<span class="tag-count">×${i.weight}</span></span>`;
        }).join("");
      } else {
        $("#interestTags").innerHTML = `<span style="color:var(--fg-mute);font-size:12.5px">尚无兴趣偏好数据</span>`;
      }

      // 关键事实
      const facts = (p.facts || []).slice(0, 8);
      $("#factList").innerHTML = facts.length
        ? facts.map(f => `<li>${escapeHTML(f)}</li>`).join("")
        : `<li style="color:var(--fg-mute);list-style:none;padding-left:0">尚无关键事实</li>`;

      // 目标 / 价值观
      const goals = [...(p.goals || []), ...(p.values || [])].slice(0, 8);
      $("#goalList").innerHTML = goals.length
        ? goals.map(g => `<li>${escapeHTML(g)}</li>`).join("")
        : `<li style="color:var(--fg-mute);list-style:none;padding-left:0">尚无目标数据</li>`;
    },
    drawRadar() {
      const canvas = $("#radarCanvas");
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const size = 320;
      canvas.width = size * dpr; canvas.height = size * dpr;
      canvas.style.width = size + "px"; canvas.style.height = size + "px";
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2, cy = size / 2, R = size / 2 - 36;
      const scores = Profile.dimensionScores();
      const dims = PROFILE_DIMENSIONS;
      const n = dims.length;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f0b429";
      const accent2 = getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim() || "#7dd3c0";
      const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg-dim").trim() || "#b8b3a8";
      const line = getComputedStyle(document.documentElement).getPropertyValue("--line-strong").trim() || "rgba(255,255,255,.16)";

      // 背景网格
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      for (let g = 1; g <= 4; g++) {
        ctx.beginPath();
        const r = R * g / 4;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
      }
      // 轴线
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
      }
      // 数据多边形
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
        const v = scores[dims[i].key] || 0;
        const r = Math.max(2, R * v);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0, this._hexA(accent, 0.45));
      grad.addColorStop(1, this._hexA(accent, 0.12));
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
      // 顶点
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
        const v = scores[dims[i].key] || 0;
        const r = Math.max(2, R * v);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = accent2; ctx.fill();
      }
      // 标签
      ctx.fillStyle = fg; ctx.font = "11px Manrope, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
        const x = cx + Math.cos(a) * (R + 20), y = cy + Math.sin(a) * (R + 20);
        ctx.fillText(dims[i].label, x, y);
      }
    },
    _hexA(hex, a) {
      hex = hex.replace("#", "");
      if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    },
    openProfileModal() {
      const p = Profile.get();
      const b = p.basic || {};
      const body = `
        <div class="field-row">
          <div class="field"><label>姓名</label><input id="pfName" value="${escapeHTML(b.name || "")}"/></div>
          <div class="field"><label>年龄</label><input id="pfAge" type="number" value="${b.age || ""}"/></div>
        </div>
        <div class="field-row">
          <div class="field"><label>性别</label><input id="pfGender" value="${escapeHTML(b.gender || "")}"/></div>
          <div class="field"><label>职业</label><input id="pfOccupation" value="${escapeHTML(b.occupation || "")}"/></div>
        </div>
        <div class="field-row">
          <div class="field"><label>所在地</label><input id="pfLocation" value="${escapeHTML(b.location || "")}"/></div>
          <div class="field"><label>MBTI</label><input id="pfMbti" value="${escapeHTML(p.personality?.mbti || "")}"/></div>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" id="pfCancel">取消</button>
          <button class="btn-primary" id="pfSave">保存</button>
        </div>`;
      Modal.open("编辑基础信息", body, () => {
        $("#pfCancel").onclick = () => Modal.close();
        $("#pfSave").onclick = () => {
          p.basic = {
            name: $("#pfName").value.trim(),
            age: $("#pfAge").value ? Number($("#pfAge").value) : undefined,
            gender: $("#pfGender").value.trim(),
            occupation: $("#pfOccupation").value.trim(),
            location: $("#pfLocation").value.trim(),
          };
          p.personality = p.personality || {};
          p.personality.mbti = $("#pfMbti").value.trim();
          p.updatedAt = Date.now();
          Store.save();
          Modal.close();
          this.renderProfile();
          toast("已保存", "ok");
        };
      });
    },

    /* ---- 设置 ---- */
    bindSettings() {
      $("#llmPreset").addEventListener("change", (e) => {
        const pre = LLM_PRESETS[e.target.value];
        if (!pre) return;
        if (pre.baseUrl) $("#llmBaseUrl").value = pre.baseUrl;
        if (pre.model) $("#llmModel").value = pre.model;
        Store.data.settings.llm.provider = e.target.value;
      });
      $("#toggleKey").addEventListener("click", () => {
        const inp = $("#llmApiKey");
        inp.type = inp.type === "password" ? "text" : "password";
      });
      $("#saveLlmBtn").addEventListener("click", () => this.saveLlm());
      $("#testLlmBtn").addEventListener("click", () => this.testLlm());

      $("#savePersonaBtn").addEventListener("click", () => this.savePersona());
      $$(".color-swatch").forEach(sw => {
        sw.addEventListener("click", () => {
          $$(".color-swatch").forEach(s => s.classList.remove("active"));
          sw.classList.add("active");
          Store.data.settings.persona.accent = sw.dataset.color;
          this.applyAccent();
          Store.save();
          this.drawRadar();
        });
      });

      $("#saveMemPolicyBtn").addEventListener("click", () => this.saveMemPolicy());
    },
    fillSettingsForm() {
      const s = Store.data.settings;
      const l = s.llm;
      $("#llmPreset").value = l.provider || "custom";
      $("#llmBaseUrl").value = l.baseUrl || "";
      $("#llmApiKey").value = l.apiKey || "";
      $("#llmModel").value = l.model || "";
      $("#llmTemp").value = l.temperature ?? 0.7;
      $("#llmMaxTokens").value = l.maxTokens ?? 2048;
      $("#memInjectCount").value = s.memory.injectCount ?? 12;
      $("#llmSystemPrompt").value = l.systemPrompt || "";
      const p = s.persona;
      $("#personaNameInput").value = p.name || "";
      $("#personaAvatarInput").value = p.avatar || "";
      $("#personaTone").value = p.tone || "温柔共情";
      $$(".color-swatch").forEach(sw => sw.classList.toggle("active", sw.dataset.color === p.accent));
      $("#autoExtract").checked = s.memory.autoExtract;
      $("#llmExtract").checked = s.memory.llmExtract;
      $("#streamToggle").checked = s.memory.stream;
    },
    saveLlm() {
      const l = Store.data.settings.llm;
      l.provider = $("#llmPreset").value;
      l.baseUrl = $("#llmBaseUrl").value.trim();
      l.apiKey = $("#llmApiKey").value.trim();
      l.model = $("#llmModel").value.trim();
      l.temperature = Number($("#llmTemp").value) || 0.7;
      l.maxTokens = Number($("#llmMaxTokens").value) || 2048;
      l.systemPrompt = $("#llmSystemPrompt").value;
      Store.data.settings.memory.injectCount = Number($("#memInjectCount").value) || 12;
      Store.save();
      this.updateConnStatus();
      this.updateTokenHint();
      toast("配置已保存（密钥仅存于本地浏览器）", "ok");
    },
    async testLlm() {
      const box = $("#testResult");
      // 先保存当前表单
      this.saveLlm();
      if (!LLM.isReady()) {
        box.className = "test-result show err";
        box.textContent = "请填写 Base URL 与模型名称";
        return;
      }
      box.className = "test-result show";
      box.style.color = "var(--accent)";
      box.style.borderColor = "var(--accent)";
      box.textContent = "测试中…";
      try {
        const out = await LLM.complete([
          { role: "system", content: "请用一句话简短回应。" },
          { role: "user", content: "你好，请回复：连接正常" },
        ]);
        box.className = "test-result show ok";
        box.textContent = "✓ 连接成功：" + (out || "(空响应)").slice(0, 120);
      } catch (e) {
        box.className = "test-result show err";
        box.textContent = "✗ " + (e.message || "请求失败").slice(0, 200);
      }
    },
    savePersona() {
      const p = Store.data.settings.persona;
      p.name = $("#personaNameInput").value.trim() || "Aria";
      p.avatar = ($("#personaAvatarInput").value.trim() || p.name.slice(0, 1)).slice(0, 2);
      p.tone = $("#personaTone").value;
      Store.save();
      this.applyPersona();
      this.renderMessages();
      toast("人格已保存", "ok");
    },
    saveMemPolicy() {
      const m = Store.data.settings.memory;
      m.autoExtract = $("#autoExtract").checked;
      m.llmExtract = $("#llmExtract").checked;
      m.stream = $("#streamToggle").checked;
      Store.save();
      toast("记忆策略已保存", "ok");
    },
    applyAccent() {
      const p = Store.data.settings.persona;
      document.documentElement.setAttribute("data-accent", p.accent || "amber");
    },
    applyPersona() {
      const p = Store.data.settings.persona;
      $("#personaName").textContent = p.name || "Aria";
      $("#personaAvatar").textContent = p.avatar || (p.name || "A").slice(0, 1);
    },
    updateConnStatus() {
      const el = $("#connStatus");
      const txt = $("#statusText");
      if (LLM.isReady()) {
        el.className = "status ok";
        txt.textContent = Store.data.settings.llm.model;
      } else {
        el.className = "status";
        txt.textContent = "未配置模型";
      }
    },

    /* ---- 导出 ---- */
    bindExport() {
      $("#exportJsonBtn").addEventListener("click", () => this.exportJSON());
      $("#exportMdBtn").addEventListener("click", () => this.exportMarkdown());
      $("#copyProfileBtn").addEventListener("click", () => this.copyProfile());
      const dz = $("#dropZone");
      const fileInput = $("#importFile");
      dz.addEventListener("click", () => fileInput.click());
      dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
      dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
      dz.addEventListener("drop", (e) => {
        e.preventDefault(); dz.classList.remove("dragover");
        if (e.dataTransfer.files[0]) this.importFile(e.dataTransfer.files[0]);
      });
      fileInput.addEventListener("change", () => {
        if (fileInput.files[0]) this.importFile(fileInput.files[0]);
      });
    },
    renderExportStats() {
      const data = Store.data;
      const convMsgs = data.conversations.reduce((s, c) => s + c.messages.length, 0);
      const items = [
        ["会话数", data.conversations.length],
        ["消息总数", convMsgs],
        ["记忆条数", data.memories.length],
        ["画像维度", Object.keys(Profile.dimensionScores()).length],
      ];
      $("#exportStats").innerHTML = items.map(([k, v]) =>
        `<div class="stat-item"><span class="stat-label">${k}</span><span class="stat-value">${v}</span></div>`).join("");
    },
    _buildExportObject() {
      const data = Store.data;
      const opt = {
        profile: $("#expProfile").checked,
        memory: $("#expMemory").checked,
        conv: $("#expConv").checked,
        settings: $("#expSettings").checked,
      };
      const out = {
        schema: SCHEMA,
        exportedAt: Date.now(),
        app: { name: APP_NAME, version: APP_VERSION },
      };
      if (opt.profile) out.profile = data.profile;
      if (opt.memory) out.memories = data.memories;
      if (opt.conv) out.conversations = data.conversations;
      if (opt.settings) {
        // 导出配置但剔除密钥
        const s = JSON.parse(JSON.stringify(data.settings));
        if (s.llm) s.llm.apiKey = "";
        out.settings = s;
      }
      return out;
    },
    exportJSON() {
      const obj = this._buildExportObject();
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
      const name = `neural-archive-${fmtDate(Date.now())}.json`;
      this._download(blob, name);
      toast("已导出标准 JSON", "ok");
    },
    exportMarkdown() {
      const p = Profile.get();
      const md = this._profileToMarkdown(p);
      const blob = new Blob([md], { type: "text/markdown" });
      this._download(blob, `neural-archive-profile-${fmtDate(Date.now())}.md`);
      toast("已导出 Markdown 画像", "ok");
    },
    _profileToMarkdown(p) {
      const L = [];
      const name = p.basic?.name || "未命名用户";
      L.push(`# ${name} 的用户画像\n`);
      L.push(`> 由 Neural Archive 于 ${fmtDate(Date.now())} 生成\n`);
      L.push(`> 标准：${SCHEMA}\n`);
      L.push(`## 基础属性\n`);
      for (const [k, v] of Object.entries(p.basic || {})) {
        if (v != null && v !== "") L.push(`- **${k}**：${v}`);
      }
      if (p.personality?.mbti) L.push(`- **MBTI**：${p.personality.mbti}`);
      L.push(`\n## 兴趣偏好\n`);
      if (p.interests?.length) {
        L.push(p.interests.map(i => `- ${i.tag.replace(/^用户喜欢/, "喜欢 ").replace(/^用户不喜欢/, "不喜欢 ")} (×${i.weight})`).join("\n"));
      } else L.push("- 暂无");
      L.push(`\n## 目标\n`);
      if (p.goals?.length) L.push(p.goals.map(g => `- ${g}`).join("\n")); else L.push("- 暂无");
      L.push(`\n## 价值观\n`);
      if (p.values?.length) L.push(p.values.map(g => `- ${g}`).join("\n")); else L.push("- 暂无");
      L.push(`\n## 关系网络\n`);
      if (p.relationships?.length) L.push(p.relationships.map(g => `- ${g}`).join("\n")); else L.push("- 暂无");
      L.push(`\n## 健康\n`);
      const h = p.health || {};
      const hItems = [];
      if (h.sleep) hItems.push(`- 睡眠：${h.sleep}`);
      if (h.exercise) hItems.push(`- 运动：${h.exercise}`);
      if (h.notes) hItems.push(`- 备注：${h.notes}`);
      L.push(hItems.length ? hItems.join("\n") : "- 暂无");
      L.push(`\n## 关键事实\n`);
      if (p.facts?.length) L.push(p.facts.map(g => `- ${g}`).join("\n")); else L.push("- 暂无");
      L.push(`\n## 维度完成度\n`);
      const scores = Profile.dimensionScores();
      for (const [k, v] of Object.entries(scores)) L.push(`- **${k}**：${Math.round(v * 100)}%`);
      L.push(`\n---\n*本文件可被外部软件/硬件读取以还原用户画像。*`);
      return L.join("\n");
    },
    copyProfile() {
      const p = Profile.get();
      const md = this._profileToMarkdown(p);
      navigator.clipboard.writeText(md).then(() => {
        toast("画像摘要已复制到剪贴板", "ok");
      }).catch(() => {
        // 降级
        const ta = document.createElement("textarea");
        ta.value = md; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); toast("已复制", "ok"); }
        catch (e) { toast("复制失败", "err"); }
        ta.remove();
      });
    },
    renderSchemaPreview() {
      const obj = this._buildExportObject();
      // 只展示前若干条避免过长
      const preview = JSON.parse(JSON.stringify(obj));
      if (preview.memories && preview.memories.length > 3) preview.memories = preview.memories.slice(0, 3).concat([{ _note: `... 共 ${obj.memories.length} 条 ...` }]);
      if (preview.conversations && preview.conversations.length > 1) preview.conversations = preview.conversations.slice(0, 1);
      if (preview.conversations && preview.conversations[0]?.messages) preview.conversations[0].messages = preview.conversations[0].messages.slice(0, 2);
      const json = JSON.stringify(preview, null, 2);
      // 简单语法高亮
      const html = escapeHTML(json)
        .replace(/&quot;([^&]+?)&quot;:/g, '<span class="k">"$1"</span>:')
        .replace(/: &quot;([^&]*?)&quot;/g, ': <span class="s">"$1"</span>')
        .replace(/: (\d+)/g, ': <span class="n">$1</span>')
        .replace(/: (true|false|null)/g, ': <span class="n">$1</span>');
      $("#schemaPreview").innerHTML = html;
    },
    _download(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    importFile(file) {
      const reader = new FileReader();
      const box = $("#importResult");
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          if (!obj || !obj.schema || !obj.schema.startsWith("neural-archive")) {
            throw new Error("非标准格式（缺少 neural-archive schema 标识）");
          }
          let added = 0, merged = 0;
          // 合并记忆（去重）
          if (Array.isArray(obj.memories)) {
            const exist = Store.data.memories.map(m => m.content);
            for (const m of obj.memories) {
              if (m.content && !exist.some(c => c.includes(m.content) || m.content.includes(c))) {
                Store.data.memories.push(Object.assign({ id: uid("mem"), createdAt: Date.now(), updatedAt: Date.now() }, m));
                added++; exist.push(m.content);
              }
            }
          }
          // 覆盖画像（若存在）
          if (obj.profile) {
            Store.data.profile = Object.assign(Profile.get(), obj.profile);
            merged++;
          }
          // 合并会话（可选）
          if (Array.isArray(obj.conversations)) {
            const existIds = new Set(Store.data.conversations.map(c => c.id));
            for (const c of obj.conversations) {
              if (!existIds.has(c.id)) { Store.data.conversations.push(c); merged++; }
            }
          }
          // 配置（不覆盖密钥）
          if (obj.settings) {
            const cur = Store.data.settings;
            const keepKey = cur.llm.apiKey;
            cur.llm = Object.assign(cur.llm, obj.settings.llm || {});
            cur.llm.apiKey = obj.settings.llm?.apiKey || keepKey;
            cur.persona = Object.assign(cur.persona, obj.settings.persona || {});
            cur.memory = Object.assign(cur.memory, obj.settings.memory || {});
          }
          Store.save();
          Profile.rebuild();
          this.renderAll();
          this.applyAccent(); this.applyPersona(); this.updateConnStatus();
          box.className = "import-result show ok";
          box.textContent = `✓ 导入成功：新增记忆 ${added} 条，合并对象 ${merged} 项`;
          toast("导入成功", "ok");
        } catch (e) {
          box.className = "import-result show err";
          box.textContent = "✗ " + (e.message || "解析失败");
          toast("导入失败", "err");
        }
      };
      reader.readAsText(file);
    },

    /* ---- 模态 ---- */
    bindModal() {
      $("#modalClose").addEventListener("click", () => Modal.close());
      $("#modalOverlay").addEventListener("click", (e) => {
        if (e.target.id === "modalOverlay") Modal.close();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") Modal.close();
      });
    },
  };

  /* ========================================================
     9. 模态控制
     ======================================================== */
  const Modal = {
    open(title, bodyHTML, afterMount) {
      $("#modalTitle").textContent = title;
      $("#modalBody").innerHTML = bodyHTML;
      $("#modalOverlay").classList.add("show");
      if (afterMount) afterMount();
    },
    close() { $("#modalOverlay").classList.remove("show"); },
  };

  /* ========================================================
     10. App 主控
     ======================================================== */
  const App = {
    init() {
      Store.load();
      UI.init();
      // 首次访问：若无会话，创建一个
      if (!Store.data.conversations.length) Chat.create();
      UI.renderAll();
      // 首次提示
      if (!LLM.isReady()) {
        setTimeout(() => toast("首次使用？请先到「设置」配置你的大模型", ""), 600);
      }
    },
    switchView(view) {
      $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
      $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
      if (view === "profile") setTimeout(() => UI.drawRadar(), 60);
      if (view === "export") this.renderExportRefresh();
    },
    renderExportRefresh() {
      UI.renderExportStats();
      UI.renderSchemaPreview();
    },
  };

  document.addEventListener("DOMContentLoaded", () => App.init());
  window.addEventListener("resize", () => { if ($("#radarCanvas")) UI.drawRadar(); });

  // 暴露调试
  window.NeuralArchive = { Store, LLM, Memory, Profile, Chat, App, UI };
})();
