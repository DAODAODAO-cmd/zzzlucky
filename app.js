(() => {
  "use strict";

  const config = window.LOTTERY_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl || "")
    && config.supabaseAnonKey
    && !config.supabaseAnonKey.startsWith("YOUR_");

  const state = {
    code: "",
    name: "",
    ownerToken: "",
    room: null,
    draws: [],
    pollTimer: null,
    busyCard: null,
    lastDrawCount: 0,
    hasRenderedRoom: false
  };

  const $ = (id) => document.getElementById(id);
  const elements = {
    landingView: $("landingView"), roomView: $("roomView"), setupWarning: $("setupWarning"),
    joinTab: $("joinTab"), createTab: $("createTab"), joinPanel: $("joinPanel"), createPanel: $("createPanel"),
    roomCode: $("roomCode"), participantName: $("participantName"), eventTitle: $("eventTitle"),
    totalCards: $("totalCards"), winnerCount: $("winnerCount"), maxDraws: $("maxDraws"),
    roomTitle: $("roomTitle"), playerGreeting: $("playerGreeting"), roomCodeDisplay: $("roomCodeDisplay"),
    remainingStat: $("remainingStat"), winnerStat: $("winnerStat"), limitStat: $("limitStat"), mineStat: $("mineStat"),
    roomNotice: $("roomNotice"), cardGrid: $("cardGrid"), historyList: $("historyList"), drawCount: $("drawCount"),
    adminPanel: $("adminPanel"), toggleRoomButton: $("toggleRoomButton"), resetRoomButton: $("resetRoomButton"),
    revealModal: $("revealModal"), revealIcon: $("revealIcon"), revealKicker: $("revealKicker"),
    revealTitle: $("revealTitle"), revealText: $("revealText"), closeRevealButton: $("closeRevealButton"),
    copyLinkButton: $("copyLinkButton"), homeButton: $("homeButton"), toast: $("toast"),
    celebrationLayer: $("celebrationLayer")
  };

  if (!configured) elements.setupWarning.classList.remove("hidden");

  const queryCode = new URLSearchParams(location.search).get("room");
  if (queryCode) {
    elements.roomCode.value = sanitizeCode(queryCode);
    elements.participantName.focus();
  }

  function sanitizeCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 20);
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
  }

  function ensureConfigured() {
    if (configured) return true;
    elements.setupWarning.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("请先按照 README 完成数据库配置");
    return false;
  }

  async function rpc(name, params = {}) {
    if (!ensureConfigured()) throw new Error("网站尚未连接数据库");
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`
      },
      body: JSON.stringify(params)
    });

    let payload = null;
    try { payload = await response.json(); } catch { /* empty response */ }
    if (!response.ok) {
      const message = payload?.message || payload?.hint || "网络繁忙，请稍后再试";
      throw new Error(translateError(message));
    }
    return payload;
  }

  function translateError(message) {
    const translations = [
      [/room not found/i, "没找到这个谷局，检查一下谷局码"],
      [/room is closed/i, "这局暂时封盘了"],
      [/room is full/i, "本局所有牌都开完了"],
      [/card already drawn/i, "这张牌刚被谷友抢先开了，换一张吧"],
      [/draw limit reached/i, "这个圈名已经开满手数了"],
      [/invalid owner token/i, "主理人身份已失效"],
      [/invalid participant name/i, "请输入 1—20 个字的圈名"],
      [/invalid room settings/i, "谷局设置不对，再检查一下数字"],
      [/Failed to fetch/i, "连接失败，请检查网络和数据库配置"]
    ];
    const found = translations.find(([pattern]) => pattern.test(message));
    return found ? found[1] : message;
  }

  function setTab(tab) {
    const joining = tab === "join";
    elements.joinTab.classList.toggle("active", joining);
    elements.createTab.classList.toggle("active", !joining);
    elements.joinTab.setAttribute("aria-selected", String(joining));
    elements.createTab.setAttribute("aria-selected", String(!joining));
    elements.joinPanel.classList.toggle("hidden", !joining);
    elements.createPanel.classList.toggle("hidden", joining);
  }

  async function loadRoom(silent = false) {
    if (!state.code || document.hidden || state.busyCard !== null) return;
    try {
      const data = await rpc("get_lottery_room", { p_room_code: state.code });
      const previousCount = state.draws.length;
      state.room = data.room;
      state.draws = Array.isArray(data.draws) ? data.draws : [];
      renderRoom();
      if (!silent && state.draws.length > previousCount) showToast("开谷战报更新了");
    } catch (error) {
      if (!silent) showToast(error.message);
    }
  }

  function enterRoom(code, name, ownerToken = "") {
    state.code = sanitizeCode(code);
    state.name = normalizeName(name);
    state.ownerToken = ownerToken || localStorage.getItem(`lottery-owner-${state.code}`) || "";
    state.hasRenderedRoom = false;
    elements.landingView.classList.add("hidden");
    elements.roomView.classList.remove("hidden");
    history.replaceState(null, "", `${location.pathname}?room=${state.code}`);
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => loadRoom(true), 2500);
  }

  function leaveRoom() {
    clearInterval(state.pollTimer);
    state.code = "";
    state.name = "";
    state.room = null;
    state.draws = [];
    state.hasRenderedRoom = false;
    elements.roomView.classList.add("hidden");
    elements.landingView.classList.remove("hidden");
    history.replaceState(null, "", location.pathname);
  }

  function renderRoom() {
    if (!state.room) return;
    const room = state.room;
    const draws = state.draws;
    const drawsByCard = new Map(draws.map((draw) => [Number(draw.card_number), draw]));
    const mine = draws.filter((draw) => normalizeName(draw.participant_name).toLocaleLowerCase() === state.name.toLocaleLowerCase());
    const wins = draws.filter((draw) => draw.is_winner).length;
    const remaining = room.total_cards - draws.length;
    const isOwner = Boolean(state.ownerToken);

    elements.roomTitle.textContent = room.title;
    elements.roomCodeDisplay.textContent = state.code;
    elements.playerGreeting.textContent = state.name
      ? `${state.name}，挑一张顺眼的牌，拼拼欧气。`
      : "主理人视图：把邀请链接甩给谷友就能开局。";
    elements.remainingStat.textContent = remaining;
    elements.winnerStat.textContent = Math.max(0, room.winner_count - wins);
    elements.limitStat.textContent = room.max_draws_per_person;
    elements.mineStat.textContent = state.name ? mine.length : "—";
    elements.drawCount.textContent = `${draws.length} 条`;
    elements.adminPanel.classList.toggle("hidden", !isOwner);
    elements.toggleRoomButton.textContent = room.is_open ? "暂时封盘" : "继续开谷";

    if (!room.is_open) elements.roomNotice.textContent = "本局暂时封盘，等主理人重新开谷。";
    else if (remaining <= 0) elements.roomNotice.textContent = "全盒开完，本局战报正式锁定。";
    else if (!state.name) elements.roomNotice.textContent = "主理人控场中，战报会自动刷新。";
    else if (mine.length >= room.max_draws_per_person) elements.roomNotice.textContent = "你的手数开满啦，来围观谷友们的欧气。";
    else elements.roomNotice.textContent = `还剩 ${room.max_draws_per_person - mine.length} 手，挑一张未开封的牌。`;

    const fragment = document.createDocumentFragment();
    for (let number = 1; number <= room.total_cards; number += 1) {
      const draw = drawsByCard.get(number);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `lottery-card${draw ? " flipped" : ""}${state.hasRenderedRoom ? "" : " dealing"}`;
      card.style.setProperty("--card-index", String(Math.min(number - 1, 16)));
      card.dataset.card = number;
      card.disabled = Boolean(draw) || !room.is_open || !state.name || mine.length >= room.max_draws_per_person || state.busyCard !== null;
      card.setAttribute("aria-label", draw ? `第 ${number} 张牌，${draw.participant_name} 已翻开` : `翻开第 ${number} 张牌`);

      const inner = document.createElement("span");
      inner.className = "card-inner";
      const front = document.createElement("span");
      front.className = "card-face card-front";
      const question = document.createElement("strong");
      question.textContent = "?";
      const label = document.createElement("span");
      label.textContent = `NO. ${String(number).padStart(2, "0")}`;
      front.append(question, label);

      const back = document.createElement("span");
      back.className = `card-face card-back${draw?.is_winner ? " winner" : ""}`;
      const icon = document.createElement("span");
      icon.className = "result-icon";
      icon.textContent = draw?.is_winner ? "✦" : "○";
      const person = document.createElement("strong");
      person.textContent = draw?.participant_name || "等待翻开";
      const result = document.createElement("span");
      result.textContent = draw ? (draw.is_winner ? "一发入魂" : "这发陪跑") : "";
      back.append(icon, person, result);
      inner.append(front, back);
      card.append(inner);
      if (!draw) card.addEventListener("click", () => drawCard(number));
      fragment.append(card);
    }
    elements.cardGrid.replaceChildren(fragment);
    state.hasRenderedRoom = true;

    if (!draws.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "还没人开牌，第一份欧气正在等谷友认领。";
      elements.historyList.replaceChildren(empty);
    } else {
      const historyFragment = document.createDocumentFragment();
      [...draws].reverse().forEach((draw) => {
        const row = document.createElement("div");
        row.className = "history-item";
        const number = document.createElement("span");
        number.className = "history-number";
        number.textContent = `#${draw.card_number}`;
        const name = document.createElement("span");
        name.className = "history-name";
        name.textContent = draw.participant_name;
        const result = document.createElement("span");
        result.className = `history-result${draw.is_winner ? " win" : ""}`;
        result.textContent = draw.is_winner ? "一发入魂 ✦" : "这发陪跑";
        row.append(number, name, result);
        historyFragment.append(row);
      });
      elements.historyList.replaceChildren(historyFragment);
    }
  }

  async function drawCard(cardNumber) {
    if (state.busyCard !== null) return;
    state.busyCard = cardNumber;
    renderRoom();
    try {
      const result = await rpc("draw_lottery_card", {
        p_room_code: state.code,
        p_participant_name: state.name,
        p_card_number: cardNumber
      });
      await animateSelectedCard(cardNumber, result);
      state.busyCard = null;
      await loadRoom(true);
      showReveal(result);
    } catch (error) {
      showToast(error.message);
      state.busyCard = null;
      await loadRoom(true);
    } finally {
      state.busyCard = null;
      renderRoom();
    }
  }

  function animateSelectedCard(cardNumber, result) {
    return new Promise((resolve) => {
      const card = elements.cardGrid.querySelector(`[data-card="${cardNumber}"]`);
      if (!card) return resolve();
      const back = card.querySelector(".card-back");
      const icon = back.querySelector(".result-icon");
      const person = back.querySelector("strong");
      const resultText = back.querySelector("span:last-child");
      back.classList.toggle("winner", Boolean(result.is_winner));
      icon.textContent = result.is_winner ? "✦" : "○";
      person.textContent = state.name;
      resultText.textContent = result.is_winner ? "一发入魂" : "这发陪跑";
      requestAnimationFrame(() => {
        card.classList.add("flipped", "just-flipped");
        if (navigator.vibrate) navigator.vibrate(result.is_winner ? [35, 35, 70] : 25);
      });
      setTimeout(resolve, 850);
    });
  }

  function launchCelebration() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#ffd85a", "#9d7cff", "#ff756e", "#65d49b", "#f7f4ff"];
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 42; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.setProperty("--x", `${Math.random() * 100}%`);
      piece.style.setProperty("--w", `${5 + Math.random() * 7}px`);
      piece.style.setProperty("--drift", `${-90 + Math.random() * 180}px`);
      piece.style.setProperty("--spin", `${360 + Math.random() * 720}deg`);
      piece.style.setProperty("--duration", `${1.7 + Math.random() * 1.2}s`);
      piece.style.setProperty("--delay", `${Math.random() * .35}s`);
      piece.style.setProperty("--color", colors[index % colors.length]);
      fragment.append(piece);
    }
    elements.celebrationLayer.replaceChildren(fragment);
    setTimeout(() => elements.celebrationLayer.replaceChildren(), 3400);
  }

  function showReveal(result) {
    const win = Boolean(result.is_winner);
    elements.revealKicker.textContent = `第 ${result.card_number} 张牌`;
    elements.revealTitle.textContent = win ? "一发入魂，欧皇降临！" : "这发陪跑";
    elements.revealText.textContent = win ? "成功回血！这份战绩已经锁在牌面上。" : "欧气还在路上，先围观一下谷友们的手气。";
    elements.revealIcon.textContent = win ? "✦" : "○";
    elements.revealModal.querySelector(".reveal-box").classList.toggle("win", win);
    elements.revealModal.classList.remove("hidden");
    if (win) launchCelebration();
    elements.closeRevealButton.focus();
  }

  elements.joinTab.addEventListener("click", () => setTab("join"));
  elements.createTab.addEventListener("click", () => setTab("create"));
  elements.roomCode.addEventListener("input", (event) => { event.target.value = sanitizeCode(event.target.value); });

  elements.totalCards.addEventListener("input", () => {
    elements.winnerCount.max = elements.totalCards.value || 60;
    elements.maxDraws.max = elements.totalCards.value || 60;
  });

  elements.joinPanel.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureConfigured()) return;
    const code = sanitizeCode(elements.roomCode.value);
    const name = normalizeName(elements.participantName.value);
    if (code.length !== 6 || !name) return showToast("请填 6 位谷局码和你的圈名");
    const button = event.submitter;
    button.disabled = true;
    try {
      const data = await rpc("get_lottery_room", { p_room_code: code });
      enterRoom(code, name);
      state.room = data.room;
      state.draws = data.draws || [];
      localStorage.setItem(`lottery-name-${code}`, name);
      renderRoom();
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });

  elements.createPanel.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureConfigured()) return;
    const title = elements.eventTitle.value.trim();
    const total = Number(elements.totalCards.value);
    const winners = Number(elements.winnerCount.value);
    const maxDraws = Number(elements.maxDraws.value);
    if (!title || total < 2 || total > 60 || winners < 1 || winners > total || maxDraws < 1 || maxDraws > total) {
      return showToast("再检查一下谷局名称和手数设置");
    }
    const button = event.submitter;
    button.disabled = true;
    try {
      const data = await rpc("create_lottery_room", {
        p_title: title,
        p_total_cards: total,
        p_winner_count: winners,
        p_max_draws: maxDraws
      });
      localStorage.setItem(`lottery-owner-${data.room_code}`, data.owner_token);
      enterRoom(data.room_code, "", data.owner_token);
      await loadRoom(true);
      showToast("开局成功，复制链接喊谷友吧");
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });

  elements.copyLinkButton.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?room=${state.code}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("喊人链接已复制");
    } catch {
      window.prompt("复制这个链接喊谷友：", url);
    }
  });

  elements.toggleRoomButton.addEventListener("click", async () => {
    try {
      await rpc("set_lottery_room_open", {
        p_room_code: state.code,
        p_owner_token: state.ownerToken,
        p_is_open: !state.room.is_open
      });
      await loadRoom(true);
      showToast(state.room.is_open ? "重新开谷啦" : "本局已封盘");
    } catch (error) { showToast(error.message); }
  });

  elements.resetRoomButton.addEventListener("click", async () => {
    if (!confirm("确定清空全部开谷战报吗？清空后不能恢复。")) return;
    try {
      await rpc("reset_lottery_room", { p_room_code: state.code, p_owner_token: state.ownerToken });
      await loadRoom(true);
      showToast("战报清空，可以重新开一轮啦");
    } catch (error) { showToast(error.message); }
  });

  elements.closeRevealButton.addEventListener("click", () => elements.revealModal.classList.add("hidden"));
  elements.revealModal.querySelector(".modal-backdrop").addEventListener("click", () => elements.revealModal.classList.add("hidden"));
  elements.homeButton.addEventListener("click", leaveRoom);
  window.addEventListener("focus", () => loadRoom(true));

  if (queryCode) {
    const rememberedName = localStorage.getItem(`lottery-name-${sanitizeCode(queryCode)}`);
    if (rememberedName) elements.participantName.value = rememberedName;
  }
})();
