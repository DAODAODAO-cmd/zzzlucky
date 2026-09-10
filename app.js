(() => {
  "use strict";
  const config = window.LOTTERY_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl || "") && config.supabaseAnonKey && !config.supabaseAnonKey.startsWith("YOUR_");
  const isAdminRoute = new URLSearchParams(location.search).get("admin") === "1";
  const state = { code: "", name: "", ownerToken: "", adminToken: sessionStorage.getItem("lottery-admin-token") || "", room: null, draws: [], entries: [], pollTimer: null, busyCard: null, hasRenderedRoom: false };
  const $ = (id) => document.getElementById(id);
  const elements = {
    landingView: $("landingView"), roomView: $("roomView"), setupWarning: $("setupWarning"), entryTabs: $("entryTabs"), joinTab: $("joinTab"), createTab: $("createTab"),
    joinPanel: $("joinPanel"), adminLoginPanel: $("adminLoginPanel"), adminPassword: $("adminPassword"), createPanel: $("createPanel"), adminRoomCode: $("adminRoomCode"), openAdminRoomButton: $("openAdminRoomButton"), roomCode: $("roomCode"), participantName: $("participantName"), eventTitle: $("eventTitle"),
    blindPrizeBlock: $("blindPrizeBlock"), groupPrizeBlock: $("groupPrizeBlock"), prizeEditor: $("prizeEditor"), boxTotalNote: $("boxTotalNote"),
    addPrizeButton: $("addPrizeButton"), groupPrizeName: $("groupPrizeName"), groupPrizeQuantity: $("groupPrizeQuantity"), groupTotalCards: $("groupTotalCards"), groupPrizeRarity: $("groupPrizeRarity"),
    limitChoiceGroup: $("limitChoiceGroup"), everyoneLimitBlock: $("everyoneLimitBlock"), namedLimitBlock: $("namedLimitBlock"), defaultMaxDraws: $("defaultMaxDraws"),
    addPersonButton: $("addPersonButton"), personEditor: $("personEditor"), roomTitle: $("roomTitle"), roomModeLabel: $("roomModeLabel"), playerGreeting: $("playerGreeting"),
    shareBox: $("shareBox"), roomCodeDisplay: $("roomCodeDisplay"), prizeLegend: $("prizeLegend"), remainingLabel: $("remainingLabel"), prizeStatLabel: $("prizeStatLabel"),
    remainingStat: $("remainingStat"), winnerStat: $("winnerStat"), limitStat: $("limitStat"), mineStat: $("mineStat"), roomNotice: $("roomNotice"),
    cardGrid: $("cardGrid"), historyList: $("historyList"), drawCount: $("drawCount"), adminPanel: $("adminPanel"), toggleRoomButton: $("toggleRoomButton"),
    resetRoomButton: $("resetRoomButton"), drawWinnersButton: $("drawWinnersButton"), revealModal: $("revealModal"), revealIcon: $("revealIcon"),
    revealKicker: $("revealKicker"), revealTitle: $("revealTitle"), revealText: $("revealText"), closeRevealButton: $("closeRevealButton"),
    copyLinkButton: $("copyLinkButton"), homeButton: $("homeButton"), toast: $("toast"), celebrationLayer: $("celebrationLayer"), brandLogo: $("brandLogo")
  };

  if (!configured) elements.setupWarning.classList.remove("hidden");
  if (isAdminRoute) { elements.createTab.classList.remove("hidden"); elements.entryTabs.classList.remove("single"); }
  if (config.brandLogoUrl) {
    elements.brandLogo.src = config.brandLogoUrl;
    elements.brandLogo.onload = () => elements.brandLogo.parentElement.classList.add("has-logo");
  }

  const queryCode = new URLSearchParams(location.search).get("room");
  if (queryCode) {
    elements.roomCode.value = cleanCode(queryCode);
    elements.participantName.value = localStorage.getItem(`lottery-name-${cleanCode(queryCode)}`) || "";
  }

  function cleanCode(value) { return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }
  function cleanName(value) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, 30); }
  function showToast(message) { elements.toast.textContent = message; elements.toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2300); }
  function ensureConfigured() { if (configured) return true; showToast("请先按照说明完成数据库配置"); return false; }

  async function rpc(name, params = {}) {
    if (!ensureConfigured()) throw new Error("网站尚未连接数据库");
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` }, body: JSON.stringify(params) });
    let payload = null; try { payload = await response.json(); } catch { /* no body */ }
    if (!response.ok) throw new Error(translateError(payload?.message || payload?.hint || "网络繁忙，请稍后再试"));
    return payload;
  }

  function translateError(message) {
    const map = [
      [/room not found/i, "没有找到这个活动，请检查活动码"], [/room is closed/i, "活动暂时停止参与"], [/room is full/i, "所有抽选位置都已使用"],
      [/card already drawn/i, "这个盲盒刚被别人选走，请换一个"], [/draw limit reached/i, "你已经达到可抽取次数"],
      [/participant not allowed/i, "这个名字不在参与名单中，请联系创建者"], [/already joined/i, "你已经加入抽选名单"],
      [/raffle already drawn/i, "本次活动已经开奖"], [/not enough participants/i, "报名人数还不够分配全部奖项"],
      [/invalid owner token/i, "活动管理身份已失效"], [/invalid participant name/i, "请输入正确的名字"],
      [/invalid admin session/i, "管理员登录已过期，请重新输入密码"], [/invalid admin password/i, "管理员密码不正确"],
      [/invalid room settings/i, "活动设置不完整，请检查后重试"], [/duplicate prize/i, "款式或奖项名称不能重复"],
      [/duplicate participant/i, "参与名单中有重复名字"], [/Could not find the function/i, "请先在 Supabase 中运行新版 supabase.sql"],
      [/Failed to fetch/i, "连接失败，请检查网络"]
    ];
    const found = map.find(([pattern]) => pattern.test(message)); return found ? found[1] : message;
  }

  function setTab(tab) {
    const joining = tab === "join";
    elements.joinTab.classList.toggle("active", joining); elements.createTab.classList.toggle("active", !joining);
    elements.joinTab.setAttribute("aria-selected", String(joining)); elements.createTab.setAttribute("aria-selected", String(!joining));
    elements.joinPanel.classList.toggle("hidden", !joining);
    elements.adminLoginPanel.classList.toggle("hidden", joining || Boolean(state.adminToken));
    elements.createPanel.classList.toggle("hidden", joining || !state.adminToken);
  }

  function addEditorRow(container, kind, name = "", quantity = 1, rarity = "standard") {
    const row = document.createElement("div"); row.className = `editor-row${kind === "prize" ? " prize-row" : ""}`;
    const text = document.createElement("input"); text.type = "text"; text.maxLength = 30; text.value = name; text.placeholder = kind === "prize" ? "款式或奖项名称" : "成员名字"; text.className = kind === "prize" ? "prize-name" : "person-name";
    const count = document.createElement("input"); count.type = "number"; count.min = "1"; count.max = kind === "prize" ? "60" : "20"; count.value = quantity; count.className = kind === "prize" ? "prize-qty" : "person-limit"; count.setAttribute("aria-label", kind === "prize" ? "数量" : "可抽次数");
    const raritySelect = document.createElement("select"); raritySelect.className = "rarity-select"; raritySelect.setAttribute("aria-label", "稀有度颜色"); [["standard","常规"],["rare","稀有"],["limited","限定"]].forEach(([value,label]) => { const option=document.createElement("option"); option.value=value; option.textContent=label; raritySelect.append(option); }); raritySelect.value=rarity;
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-row"; remove.textContent = "×"; remove.setAttribute("aria-label", "删除这一行");
    remove.addEventListener("click", () => { if (container.children.length > 1) row.remove(); else { text.value = ""; count.value = "1"; } updateCreateUI(); });
    count.addEventListener("input", updateCreateUI); row.append(text, count); if (kind === "prize") row.append(raritySelect); row.append(remove); container.append(row); updateCreateUI();
  }

  function currentMode() { return document.querySelector('input[name="lotteryMode"]:checked').value; }
  function currentLimitMode() { return document.querySelector('input[name="limitMode"]:checked').value; }
  function readRows(container, nameClass, qtyClass) { return [...container.children].map(row => ({ name: cleanName(row.querySelector(`.${nameClass}`).value), quantity: Number(row.querySelector(`.${qtyClass}`).value), ...(row.querySelector(".rarity-select") ? { rarity: row.querySelector(".rarity-select").value } : {}) })).filter(item => item.name); }

  function updateCreateUI() {
    const mode = currentMode(); const named = currentLimitMode() === "named";
    document.querySelectorAll(".mode-card").forEach(card => card.classList.toggle("selected", card.querySelector("input").checked));
    elements.blindPrizeBlock.classList.toggle("hidden", mode === "group"); elements.groupPrizeBlock.classList.toggle("hidden", mode !== "group");
    elements.limitChoiceGroup.classList.toggle("hidden", mode === "raffle"); elements.everyoneLimitBlock.classList.toggle("hidden", mode === "raffle" || named);
    elements.namedLimitBlock.classList.toggle("hidden", mode === "raffle" || !named);
    const prizes = readRows(elements.prizeEditor, "prize-name", "prize-qty"); const total = prizes.reduce((sum, p) => sum + (p.quantity || 0), 0);
    elements.blindPrizeBlock.querySelector(".block-title span").textContent = mode === "raffle" ? "奖项名称与名额" : "盲盒款式与数量";
    elements.addPrizeButton.textContent = mode === "raffle" ? "＋ 添加奖项" : "＋ 添加款式";
    elements.boxTotalNote.textContent = mode === "raffle" ? `共 ${total} 个获奖名额，报名人数无需预设` : `共 ${total} 盒`;
  }

  addEditorRow(elements.prizeEditor, "prize", "A 款", 2, "standard"); addEditorRow(elements.prizeEditor, "prize", "B 款", 2, "rare"); addEditorRow(elements.personEditor, "person", "", 1);
  document.querySelectorAll('input[name="lotteryMode"], input[name="limitMode"]').forEach(input => input.addEventListener("change", updateCreateUI));
  elements.addPrizeButton.addEventListener("click", () => addEditorRow(elements.prizeEditor, "prize", "", 1));
  elements.addPersonButton.addEventListener("click", () => addEditorRow(elements.personEditor, "person", "", 1));

  async function loadRoom(silent = false) {
    if (!state.code || document.hidden || state.busyCard !== null) return;
    try {
      const data = await rpc("get_lottery_room", { p_room_code: state.code, p_participant_name: state.name || null });
      const oldCount = state.draws.length + state.entries.length; state.room = data.room; state.draws = data.draws || []; state.entries = data.entries || []; renderRoom();
      if (!silent && state.draws.length + state.entries.length > oldCount) showToast("活动记录已更新");
    } catch (error) { if (!silent) showToast(error.message); }
  }

  function enterRoom(code, name, ownerToken = "") {
    state.code = cleanCode(code); state.name = cleanName(name); state.ownerToken = ownerToken || localStorage.getItem(`lottery-owner-${state.code}`) || ""; state.hasRenderedRoom = false;
    elements.landingView.classList.add("hidden"); elements.roomView.classList.remove("hidden"); history.replaceState(null, "", `${location.pathname}?room=${state.code}`);
    clearInterval(state.pollTimer); state.pollTimer = setInterval(() => loadRoom(true), 2500);
  }

  function leaveRoom() { clearInterval(state.pollTimer); Object.assign(state, { code: "", name: "", room: null, draws: [], entries: [], hasRenderedRoom: false }); elements.roomView.classList.add("hidden"); elements.landingView.classList.remove("hidden"); history.replaceState(null, "", isAdminRoute ? `${location.pathname}?admin=1` : location.pathname); if (isAdminRoute) setTab("create"); }

  function renderRoom() {
    if (!state.room) return; const room = state.room; const isRaffle = room.mode === "raffle"; const isBlind = room.mode === "blind";
    const mine = state.draws.filter(d => cleanName(d.participant_name).toLowerCase() === state.name.toLowerCase()); const joined = state.entries.some(e => cleanName(e.participant_name).toLowerCase() === state.name.toLowerCase());
    const awarded = state.draws.filter(d => d.prize_name).length; const prizeTotal = room.prizes.reduce((sum, p) => sum + Number(p.quantity), 0); const remaining = room.total_cards - state.draws.length;
    elements.roomTitle.textContent = room.title; elements.roomCodeDisplay.textContent = state.code; elements.roomModeLabel.textContent = isRaffle ? "LIST DRAW" : isBlind ? "BLIND BOX" : "GROUP DRAW";
    elements.playerGreeting.textContent = state.name ? `${state.name}，${isRaffle ? "确认名字后加入名单吧。" : "选一个喜欢的盒子吧。"}` : "把邀请链接分享给参与成员即可。";
    const labels = elements.roomView.querySelectorAll(".stat span");
    if (isRaffle) { labels[0].textContent = "已报名"; labels[1].textContent = "获奖名额"; labels[2].textContent = "活动状态"; labels[3].textContent = "我的状态"; elements.remainingStat.textContent = state.entries.length; elements.winnerStat.textContent = prizeTotal; elements.limitStat.textContent = room.phase === "drawn" ? "已开奖" : room.is_open ? "报名中" : "已暂停"; elements.mineStat.textContent = state.name ? (joined ? "已报名" : "未报名") : "—"; }
    else { labels[0].textContent = isBlind ? "剩余盲盒" : "剩余抽选"; labels[1].textContent = isBlind ? "款式数量" : "剩余礼物"; labels[2].textContent = "你的次数"; labels[3].textContent = "你已抽取"; elements.remainingStat.textContent = remaining; elements.winnerStat.textContent = isBlind ? room.prizes.length : Math.max(0, prizeTotal - awarded); elements.limitStat.textContent = room.my_limit ?? "—"; elements.mineStat.textContent = state.name ? mine.length : "—"; }
    elements.drawCount.textContent = isRaffle ? `${state.entries.length} 人报名` : `${state.draws.length} 条`;
    elements.shareBox.classList.toggle("hidden", !state.ownerToken); elements.adminPanel.classList.toggle("hidden", !state.ownerToken); elements.drawWinnersButton.classList.toggle("hidden", !isRaffle || room.phase === "drawn"); elements.toggleRoomButton.classList.toggle("hidden", isRaffle && room.phase === "drawn"); elements.toggleRoomButton.textContent = room.is_open ? (isRaffle ? "暂停报名" : "暂停抽选") : (isRaffle ? "继续报名" : "继续抽选");
    renderPrizeLegend(); if (isRaffle) renderRaffle(joined); else renderCards(mine); renderHistory(isRaffle);
  }

  function renderPrizeLegend() {
    const fragment = document.createDocumentFragment(); state.room.prizes.forEach(prize => { const chip = document.createElement("span"); chip.className = "prize-chip"; chip.textContent = `${prize.name} × ${prize.quantity}`; fragment.append(chip); }); elements.prizeLegend.replaceChildren(fragment);
  }

  function prizeRarity(prizeName) { return state.room?.prizes?.find(prize => prize.name === prizeName)?.rarity || "standard"; }

  function renderRaffle(joined) {
    const room = state.room; const panel = document.createElement("div"); panel.className = "raffle-panel"; const icon = document.createElement("div"); icon.className = "reveal-icon"; icon.textContent = room.phase === "drawn" ? "✦" : "◎"; const title = document.createElement("strong"); const text = document.createElement("p");
    if (room.phase === "drawn") { title.textContent = "获奖名单已经公布"; text.textContent = "可以在下方查看每个奖项的获得者。"; }
    else if (joined) { title.textContent = "你已经加入抽选名单"; text.textContent = `目前共有 ${state.entries.length} 人报名，请等待创建者开奖。`; }
    else if (!state.name) { title.textContent = `${state.entries.length} 人已报名`; text.textContent = "创建者可以在报名结束后统一开奖。"; }
    else if (!room.is_open) { title.textContent = "报名暂时停止"; text.textContent = "请等待创建者重新开放报名。"; }
    else { title.textContent = "加入抽选名单"; text.textContent = "不需要提前确定总人数，每个名字只能报名一次。"; const button = document.createElement("button"); button.type = "button"; button.className = "primary-button"; button.innerHTML = "<span>确认报名</span>"; button.addEventListener("click", joinRaffle); panel.append(icon, title, text, button); elements.cardGrid.replaceChildren(panel); elements.roomNotice.textContent = "确认名字无误后加入名单，开奖结果会保留在这里。"; return; }
    panel.append(icon, title, text); elements.cardGrid.replaceChildren(panel); elements.roomNotice.textContent = room.phase === "drawn" ? "本次抽选已完成。" : "报名人数会自动更新。";
  }

  function renderCards(mine) {
    const room = state.room; const byCard = new Map(state.draws.map(d => [Number(d.card_number), d])); const fragment = document.createDocumentFragment(); const exhausted = mine.length >= (room.my_limit ?? 0);
    if (!room.is_open) elements.roomNotice.textContent = "活动暂时停止抽选。"; else if (state.draws.length >= room.total_cards) elements.roomNotice.textContent = "所有盲盒都已经打开。"; else if (!state.name) elements.roomNotice.textContent = "创建者视图：记录会自动更新。"; else if (room.my_limit === null) elements.roomNotice.textContent = "这个名字不在参与名单中。"; else if (exhausted) elements.roomNotice.textContent = "你的抽取次数已经用完，可以查看大家的开盒记录。"; else elements.roomNotice.textContent = `你还可以抽 ${room.my_limit - mine.length} 次，选一个未打开的盒子吧。`;
    for (let number = 1; number <= room.total_cards; number += 1) {
      const draw = byCard.get(number); const card = document.createElement("button"); card.type = "button"; card.className = `lottery-card${draw ? " flipped" : ""}${state.hasRenderedRoom ? "" : " dealing"}`; card.dataset.card = number; card.style.setProperty("--card-index", String(Math.min(number - 1, 16))); card.disabled = Boolean(draw) || !room.is_open || !state.name || exhausted || room.my_limit === null || state.busyCard !== null;
      const inner = document.createElement("span"); inner.className = "card-inner"; const front = document.createElement("span"); front.className = "card-face card-front";
      if (config.brandLogoUrl) { const logo = document.createElement("img"); logo.className = "card-logo"; logo.src = config.brandLogoUrl; logo.alt = ""; front.append(logo); } else { const mark = document.createElement("strong"); mark.textContent = "?"; front.append(mark); }
      const no = document.createElement("span"); no.textContent = `BOX ${String(number).padStart(2, "0")}`; front.append(no);
      const rarity = draw?.prize_name ? prizeRarity(draw.prize_name) : ""; const back = document.createElement("span"); back.className = `card-face card-back${draw?.prize_name ? ` winner rarity-${rarity}` : ""}`; const icon = document.createElement("span"); icon.className = "result-icon"; icon.textContent = draw?.prize_name ? "✦" : "○"; const person = document.createElement("strong"); person.textContent = draw?.participant_name || "等待打开"; const result = document.createElement("span"); result.textContent = draw ? (draw.prize_name || "本次未抽中") : ""; back.append(icon, person, result); inner.append(front, back); card.append(inner); if (!draw) card.addEventListener("click", () => drawCard(number)); fragment.append(card);
    }
    elements.cardGrid.replaceChildren(fragment); state.hasRenderedRoom = true;
  }

  function renderHistory(isRaffle) {
    const items = isRaffle ? state.draws : [...state.draws].reverse(); if (!items.length) { const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = isRaffle ? "还没有公布获奖名单。" : "还没有人打开盲盒。"; elements.historyList.replaceChildren(empty); return; }
    const fragment = document.createDocumentFragment(); items.forEach((draw, index) => { const row = document.createElement("div"); row.className = "history-item"; const no = document.createElement("span"); no.className = "history-number"; no.textContent = isRaffle ? String(index + 1) : `#${draw.card_number}`; const name = document.createElement("span"); name.className = "history-name"; name.textContent = draw.participant_name; const result = document.createElement("span"); result.className = `history-result${draw.prize_name ? " win" : ""}`; result.textContent = draw.prize_name || "本次未抽中"; row.append(no, name, result); fragment.append(row); }); elements.historyList.replaceChildren(fragment);
  }

  async function drawCard(cardNumber) {
    if (state.busyCard !== null) return; state.busyCard = cardNumber; renderRoom();
    try { const result = await rpc("draw_lottery_card", { p_room_code: state.code, p_participant_name: state.name, p_card_number: cardNumber }); await animateCard(cardNumber, result); state.busyCard = null; await loadRoom(true); showReveal(result); }
    catch (error) { state.busyCard = null; showToast(error.message); await loadRoom(true); }
  }

  function animateCard(cardNumber, result) { return new Promise(resolve => { const card = elements.cardGrid.querySelector(`[data-card="${cardNumber}"]`); if (!card) return resolve(); const back = card.querySelector(".card-back"); const rarity=prizeRarity(result.prize_name); back.classList.toggle("winner", Boolean(result.prize_name)); if(result.prize_name)back.classList.add(`rarity-${rarity}`); back.querySelector(".result-icon").textContent = result.prize_name ? "✦" : "○"; back.querySelector("strong").textContent = state.name; back.querySelector("span:last-child").textContent = result.prize_name || "本次未抽中"; requestAnimationFrame(() => { card.classList.add("flipped", "just-flipped", `reveal-${rarity}`); if (navigator.vibrate) navigator.vibrate(rarity === "limited" ? [45,35,90,35,120] : rarity === "rare" ? [40,30,80] : 25); }); setTimeout(resolve, rarity === "limited" ? 1250 : rarity === "rare" ? 1050 : 850); }); }

  async function joinRaffle() { try { await rpc("join_lottery_raffle", { p_room_code: state.code, p_participant_name: state.name }); await loadRoom(true); showToast("报名成功"); } catch (error) { showToast(error.message); } }
  async function drawRaffleWinners() { if (!confirm("确定结束报名并立即开奖吗？开奖后名单不能继续增加。")) return; try { await rpc("draw_lottery_winners", { p_room_code: state.code, p_owner_token: state.ownerToken }); await loadRoom(true); launchCelebration("limited"); showToast("开奖完成"); } catch (error) { showToast(error.message); } }

  function showReveal(result) { const won = Boolean(result.prize_name); const rarity=prizeRarity(result.prize_name); elements.revealKicker.textContent = `第 ${result.card_number} 个盒子`; elements.revealTitle.textContent = won ? `抽到「${result.prize_name}」啦！` : "这个盒子没有礼物"; elements.revealText.textContent = won ? "结果已经记录，可以继续看看大家开出了什么。" : "本次没有抽中，结果也会保留在开盒记录里。"; elements.revealIcon.textContent = won ? "✦" : "○"; const box=elements.revealModal.querySelector(".reveal-box"); box.classList.remove("rarity-standard","rarity-rare","rarity-limited"); box.classList.toggle("win",won); if(won)box.classList.add(`rarity-${rarity}`); elements.revealModal.classList.remove("hidden"); if (won) launchCelebration(rarity); elements.closeRevealButton.focus(); }
  function launchCelebration(rarity="standard") { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; const palettes={standard:["#c7bce9","#eee9fa","#ffffff"],rare:["#6e9ce8","#806bd1","#b8d8ff","#ffffff"],limited:["#ffcf68","#ef8d9d","#f2ad68","#fff1a8","#ffffff"]}; const colors=palettes[rarity]||palettes.standard; const count=rarity==="limited"?64:rarity==="rare"?48:24; const fragment = document.createDocumentFragment(); for (let i=0;i<count;i+=1) { const p=document.createElement("i"); p.className="confetti"; p.style.setProperty("--x",`${Math.random()*100}%`); p.style.setProperty("--w",`${5+Math.random()*7}px`); p.style.setProperty("--drift",`${-90+Math.random()*180}px`); p.style.setProperty("--spin",`${360+Math.random()*720}deg`); p.style.setProperty("--duration",`${1.7+Math.random()*1.2}s`); p.style.setProperty("--delay",`${Math.random()*.35}s`); p.style.setProperty("--color",colors[i%colors.length]); fragment.append(p); } elements.celebrationLayer.replaceChildren(fragment); setTimeout(()=>elements.celebrationLayer.replaceChildren(),3400); }

  elements.joinTab.addEventListener("click", () => setTab("join")); elements.createTab.addEventListener("click", () => setTab("create")); elements.roomCode.addEventListener("input", e => { e.target.value = cleanCode(e.target.value); });
  elements.adminLoginPanel.addEventListener("submit", async event => { event.preventDefault(); event.submitter.disabled=true; try { const token=await rpc("admin_login",{p_password:elements.adminPassword.value}); state.adminToken=token; sessionStorage.setItem("lottery-admin-token",token); elements.adminPassword.value=""; setTab("create"); showToast("管理员验证成功"); } catch(error) { showToast(error.message); } finally { event.submitter.disabled=false; } });
  elements.adminRoomCode.addEventListener("input", e => { e.target.value = cleanCode(e.target.value); });
  elements.openAdminRoomButton.addEventListener("click", async () => { const code=cleanCode(elements.adminRoomCode.value); if(code.length!==6)return showToast("请输入 6 位活动码"); elements.openAdminRoomButton.disabled=true; try{const ownerToken=await rpc("admin_open_room",{p_admin_token:state.adminToken,p_room_code:code});enterRoom(code,"",ownerToken);await loadRoom(true);showToast("已打开活动管理");}catch(error){if(/管理员|admin/i.test(error.message)){state.adminToken="";sessionStorage.removeItem("lottery-admin-token");setTab("create");}showToast(error.message);}finally{elements.openAdminRoomButton.disabled=false;} });
  elements.joinPanel.addEventListener("submit", async event => { event.preventDefault(); const code=cleanCode(elements.roomCode.value), name=cleanName(elements.participantName.value); if (code.length!==6||!name) return showToast("请填写活动码和名字"); event.submitter.disabled=true; try { const data=await rpc("get_lottery_room",{p_room_code:code,p_participant_name:name}); enterRoom(code,name); state.room=data.room; state.draws=data.draws||[]; state.entries=data.entries||[]; localStorage.setItem(`lottery-name-${code}`,name); renderRoom(); } catch(error){showToast(error.message);} finally{event.submitter.disabled=false;} });
  elements.createPanel.addEventListener("submit", async event => { event.preventDefault(); const mode=currentMode(); let prizes,total; if(mode==="group"){prizes=[{name:cleanName(elements.groupPrizeName.value),quantity:Number(elements.groupPrizeQuantity.value),rarity:elements.groupPrizeRarity.value}];total=Number(elements.groupTotalCards.value);}else{prizes=readRows(elements.prizeEditor,"prize-name","prize-qty");total=mode==="raffle"?9999:prizes.reduce((s,p)=>s+p.quantity,0);} const participants=mode!=="raffle"&&currentLimitMode()==="named"?readRows(elements.personEditor,"person-name","person-limit").map(p=>({name:p.name,limit:p.quantity})):[]; const defaultLimit=mode==="raffle"?1:Number(elements.defaultMaxDraws.value); if(!cleanName(elements.eventTitle.value)||!prizes.length||prizes.some(p=>!p.name||p.quantity<1)||total<2||(mode==="group"&&prizes[0].quantity>total)||(currentLimitMode()==="named"&&mode!=="raffle"&&!participants.length)) return showToast("请把活动设置填写完整"); event.submitter.disabled=true; try{const data=await rpc("create_lottery_room",{p_admin_token:state.adminToken,p_title:cleanName(elements.eventTitle.value),p_mode:mode,p_total_cards:total,p_default_max_draws:defaultLimit,p_prizes:prizes,p_participant_limits:participants});localStorage.setItem(`lottery-owner-${data.room_code}`,data.owner_token);enterRoom(data.room_code,"",data.owner_token);await loadRoom(true);showToast("活动创建成功");}catch(error){if(/管理员|admin/i.test(error.message)){state.adminToken="";sessionStorage.removeItem("lottery-admin-token");setTab("create");}showToast(error.message);}finally{event.submitter.disabled=false;} });
  elements.copyLinkButton.addEventListener("click",async()=>{const url=`${location.origin}${location.pathname}?room=${state.code}`;try{await navigator.clipboard.writeText(url);showToast("邀请链接已复制");}catch{window.prompt("复制邀请链接：",url);}});
  elements.toggleRoomButton.addEventListener("click",async()=>{try{await rpc("set_lottery_room_open",{p_room_code:state.code,p_owner_token:state.ownerToken,p_is_open:!state.room.is_open});await loadRoom(true);showToast(state.room.is_open?"活动已继续":"活动已暂停");}catch(error){showToast(error.message);}});
  elements.resetRoomButton.addEventListener("click",async()=>{if(!confirm("确定清空本次活动的全部记录吗？"))return;try{await rpc("reset_lottery_room",{p_room_code:state.code,p_owner_token:state.ownerToken});await loadRoom(true);showToast("记录已清空");}catch(error){showToast(error.message);}});
  elements.drawWinnersButton.addEventListener("click",drawRaffleWinners); elements.closeRevealButton.addEventListener("click",()=>elements.revealModal.classList.add("hidden")); elements.revealModal.querySelector(".modal-backdrop").addEventListener("click",()=>elements.revealModal.classList.add("hidden")); elements.homeButton.addEventListener("click",leaveRoom); window.addEventListener("focus",()=>loadRoom(true)); updateCreateUI(); if (isAdminRoute && !queryCode) setTab("create");
})();
