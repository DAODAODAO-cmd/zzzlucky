// ============================
// 1) 把下面两个值替换成你的 Supabase 项目参数
// Supabase -> Project Settings -> API
// ============================
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// 前端只保存“进入管理员面板”的口令。
// 真正生产使用建议改为 Supabase Auth；小范围朋友使用可先用这一版。
const ADMIN_PASSWORD = "CHANGE_ME";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const els = {
  loginCard: document.querySelector("#loginCard"),
  drawCard: document.querySelector("#drawCard"),
  nameInput: document.querySelector("#nameInput"),
  enterBtn: document.querySelector("#enterBtn"),
  userName: document.querySelector("#userName"),
  remainingCount: document.querySelector("#remainingCount"),
  winnerRemaining: document.querySelector("#winnerRemaining"),
  myCount: document.querySelector("#myCount"),
  drawBtn: document.querySelector("#drawBtn"),
  resultBox: document.querySelector("#resultBox"),
  recordsBody: document.querySelector("#recordsBody"),
  refreshBtn: document.querySelector("#refreshBtn"),
  adminBtn: document.querySelector("#adminBtn"),
  adminDialog: document.querySelector("#adminDialog"),
  adminPassword: document.querySelector("#adminPassword"),
  roomName: document.querySelector("#roomName"),
  totalCards: document.querySelector("#totalCards"),
  winningCards: document.querySelector("#winningCards"),
  maxDraws: document.querySelector("#maxDraws"),
  createRoundBtn: document.querySelector("#createRoundBtn"),
  gachaCard: document.querySelector("#gachaCard"),
  cardEmoji: document.querySelector("#cardEmoji"),
  cardTitle: document.querySelector("#cardTitle"),
  cardNumber: document.querySelector("#cardNumber"),
  gachaFront: document.querySelector(".gacha-front"),
};

let currentName = localStorage.getItem("draw_name") || "";
let round = null;

function assertConfigured() {
  if (SUPABASE_URL.startsWith("YOUR_") || SUPABASE_ANON_KEY.startsWith("YOUR_")) {
    alert("请先在 app.js 顶部填写 SUPABASE_URL 和 SUPABASE_ANON_KEY。");
    return false;
  }
  return true;
}

function formatTime(v) {
  return new Date(v).toLocaleString("zh-CN", { hour12: false });
}

async function loadRound() {
  if (!assertConfigured()) return;
  const { data, error } = await sb
    .from("rounds")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  round = data;
  if (!round) {
    els.remainingCount.textContent = "0";
    els.winnerRemaining.textContent = "0";
    els.drawBtn.disabled = true;
    els.resultBox.textContent = "管理员尚未创建抽奖";
    await loadRecords();
    return;
  }

  const { count: drawnCount } = await sb
    .from("draws")
    .select("*", { count: "exact", head: true })
    .eq("round_id", round.id);

  const { count: wonCount } = await sb
    .from("draws")
    .select("*", { count: "exact", head: true })
    .eq("round_id", round.id)
    .eq("is_winner", true);

  const { count: mine } = currentName
    ? await sb
        .from("draws")
        .select("*", { count: "exact", head: true })
        .eq("round_id", round.id)
        .eq("participant_name", currentName)
    : { count: 0 };

  els.remainingCount.textContent = Math.max(0, round.total_cards - (drawnCount || 0));
  els.winnerRemaining.textContent = Math.max(0, round.winning_cards - (wonCount || 0));
  els.myCount.textContent = `${mine || 0} / ${round.max_draws_per_person}`;
  els.drawBtn.disabled =
    !currentName ||
    (mine || 0) >= round.max_draws_per_person ||
    (drawnCount || 0) >= round.total_cards;

  await loadRecords();
}

async function loadRecords() {
  if (!assertConfigured()) return;
  let query = sb
    .from("draws")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (round?.id) query = query.eq("round_id", round.id);

  const { data, error } = await query;
  if (error) return console.error(error);

  els.recordsBody.innerHTML = "";
  (data || []).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatTime(r.created_at)}</td>
      <td>${escapeHtml(r.participant_name)}</td>
      <td>${r.draw_number}</td>
      <td>#${String(r.card_number).padStart(2,"0")}</td>
      <td>${r.is_winner ? "✨ 欧气降临" : "下次一定"}</td>`;
    els.recordsBody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

async function enter() {
  const name = els.nameInput.value.trim();
  if (!name) return alert("请输入名字");
  currentName = name;
  localStorage.setItem("draw_name", name);
  els.userName.textContent = name;
  els.loginCard.classList.add("hidden");
  els.drawCard.classList.remove("hidden");
  await loadRound();
}

async function draw() {
  if (!round || !currentName) return;
  els.drawBtn.disabled = true;
  els.gachaCard.classList.remove("flipped");
  els.gachaCard.classList.add("shuffling");
  els.resultBox.className = "result-box compact";
  els.resultBox.textContent = "谷子正在选择它的主人…";
  await new Promise(resolve => setTimeout(resolve, 700));
  els.gachaCard.classList.remove("shuffling");

  const { data, error } = await sb.rpc("draw_card", {
    p_round_id: round.id,
    p_participant_name: currentName
  });

  if (error) {
    console.error(error);
    els.resultBox.textContent = error.message || "抽取失败";
    await loadRound();
    return;
  }

  const r = Array.isArray(data) ? data[0] : data;
  if (!r) {
    els.resultBox.textContent = "没有可抽取的卡片";
  } else {
    const num = String(r.card_number).padStart(2,"0");
    els.cardEmoji.textContent = r.is_winner ? "✨" : "🍪";
    els.cardTitle.textContent = r.is_winner ? "欧气降临！" : "下次一定";
    els.cardNumber.textContent = `CARD #${num}`;
    els.gachaFront.classList.toggle("lose", !r.is_winner);
    els.resultBox.classList.add(r.is_winner ? "win" : "lose");
    els.resultBox.textContent = r.is_winner ? "这口谷被你吃到了 ✨" : "这次擦肩而过，下次一定";
    requestAnimationFrame(() => els.gachaCard.classList.add("flipped"));
  }

  await loadRound();
}

async function createRound(e) {
  e.preventDefault();
  if (!assertConfigured()) return;
  if (els.adminPassword.value !== ADMIN_PASSWORD) return alert("管理员密码错误");

  const total = Number(els.totalCards.value);
  const winners = Number(els.winningCards.value);
  const maxDraws = Number(els.maxDraws.value);

  if (total < 1 || winners < 0 || winners > total || maxDraws < 1) {
    return alert("参数不正确：中奖数不能大于总卡数。");
  }

  if (!confirm("这会结束当前轮次并创建一轮新的抽奖，确定继续？")) return;

  const { error } = await sb.rpc("create_round", {
    p_name: els.roomName.value.trim() || "Default Room",
    p_total_cards: total,
    p_winning_cards: winners,
    p_max_draws_per_person: maxDraws
  });

  if (error) {
    console.error(error);
    return alert(error.message || "创建失败");
  }

  els.adminDialog.close();
  els.resultBox.textContent = "新一轮开谷啦，可以开始抽了！";
  await loadRound();
}

els.enterBtn.addEventListener("click", enter);
els.nameInput.addEventListener("keydown", e => e.key === "Enter" && enter());
els.drawBtn.addEventListener("click", draw);
els.refreshBtn.addEventListener("click", loadRound);
els.adminBtn.addEventListener("click", () => els.adminDialog.showModal());
els.createRoundBtn.addEventListener("click", createRound);

if (currentName) {
  els.nameInput.value = currentName;
  enter();
} else {
  loadRound();
}

// 多人实时刷新
if (!SUPABASE_URL.startsWith("YOUR_")) {
  sb.channel("draw-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "draws" }, loadRound)
    .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, loadRound)
    .subscribe();
}
