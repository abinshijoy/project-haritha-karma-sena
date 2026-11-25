/* Green Points Wallet + Voucher Marketplace UI (vanilla JS, no build step). */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let summary = null;
let vouchers = [];
let coupons = [];
let transactionFilter = "ALL";
let activeTab = "redeem";
let pendingRedemption = null;
let toastTimer = null;

const userIdInput = $("#userId");

const getUserId = () => (userIdInput.value || "member-5").trim();

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data;
  try {
    data = await response.json();
  } catch (_) {
    data = { error: { message: "Unexpected server response." } };
  }
  if (!response.ok) {
    const message = (data && data.error && data.error.message) || "Request failed.";
    throw new Error(message);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function tierFor(balance) {
  if (balance >= 500) return { name: "Haritha Champion", next: null, pointsToNext: 0 };
  if (balance >= 200) return { name: "Green Guardian", next: "Haritha Champion", pointsToNext: 500 - balance };
  return { name: "Eco Starter", next: "Green Guardian", pointsToNext: 200 - balance };
}

async function loadWallet() {
  $("#walletLoading").hidden = false;
  $("#walletContent").hidden = true;
  try {
    summary = await api(`/api/rewards/summary?userId=${encodeURIComponent(getUserId())}`);
    renderWallet();
    $("#walletLoading").hidden = true;
    $("#walletContent").hidden = false;
  } catch (error) {
    $("#walletLoading").textContent = `Could not load wallet: ${error.message}`;
  }
}

function renderWallet() {
  const balance = summary.balance;
  const tier = tierFor(balance);
  $("#balance").textContent = balance;
  $("#tierBadge").textContent = tier.name;

  if (tier.next) {
    const floor = tier.name === "Eco Starter" ? 0 : 200;
    const span = tier.pointsToNext + (balance - floor);
    const progress = span > 0 ? Math.round(((balance - floor) / span) * 100) : 0;
    $("#progressFrom").textContent = tier.name;
    $("#progressTo").textContent = tier.next;
    $("#progressFill").style.width = `${Math.min(100, Math.max(0, progress))}%`;
    $("#progressHint").textContent = `${tier.pointsToNext} more points to reach ${tier.next}.`;
  } else {
    $("#progressFrom").textContent = "Haritha Champion";
    $("#progressTo").textContent = "Top tier";
    $("#progressFill").style.width = "100%";
    $("#progressHint").textContent = "You've reached the highest eco level. Keep it up!";
  }

  renderTransactions();
}

function renderTransactions() {
  const list = $("#transactionList");
  const transactions = (summary.transactions || []).filter((tx) =>
    transactionFilter === "ALL" ? true : tx.type === transactionFilter
  );

  if (transactions.length === 0) {
    list.innerHTML = `<div class="state-card">No transactions yet. Pay your HKS bill or get verified for clean segregation to earn points.</div>`;
    return;
  }

  list.innerHTML = transactions.map((tx) => {
    const earned = tx.type === "EARN";
    const points = Math.abs(Number(tx.points || 0));
    return `
      <div class="tx-row">
        <div class="tx-main">
          <strong>${escapeHtml(tx.reason)}</strong>
          <small>${formatDate(tx.createdAt)} · ${earned ? "Earned" : "Redeemed"}</small>
        </div>
        <div class="tx-points ${earned ? "plus" : "minus"}">${earned ? "+" : "−"}${points}</div>
      </div>`;
  }).join("");
}

async function loadStore() {
  $("#storeLoading").hidden = false;
  $("#redeemPanel").hidden = true;
  $("#couponPanel").hidden = true;
  try {
    const userId = encodeURIComponent(getUserId());
    const [voucherData, couponData] = await Promise.all([
      api("/api/rewards/vouchers"),
      api(`/api/rewards/coupons?userId=${userId}`),
    ]);
    vouchers = voucherData.vouchers || [];
    coupons = couponData.coupons || [];
    renderVouchers();
    renderCoupons();
    $("#storeLoading").hidden = true;
    showTab(activeTab);
  } catch (error) {
    $("#storeLoading").textContent = `Could not load rewards: ${error.message}`;
  }
}

function renderVouchers() {
  const grid = $("#voucherGrid");
  const balance = summary ? summary.balance : 0;

  if (vouchers.length === 0) {
    grid.innerHTML = `<div class="state-card">No vouchers available right now.</div>`;
    return;
  }

  grid.innerHTML = vouchers.map((voucher) => {
    const cost = Number(voucher.pointsRequired || 0);
    const stock = Number(voucher.stock || 0);
    const disabled = stock <= 0 || balance < cost;
    const label = stock <= 0 ? "Out of stock" : balance < cost ? "Not enough points" : "Redeem";
    return `
      <article class="voucher-card">
        <span class="voucher-category">${escapeHtml(voucher.category || "reward")}</span>
        <h3>${escapeHtml(voucher.title)}</h3>
        <p>${escapeHtml(voucher.description)}</p>
        <div class="voucher-meta">
          <span class="cost">${cost} pts</span>
          <span class="coupon-meta">${stock} left</span>
        </div>
        <div class="voucher-meta">
          <span class="coupon-meta">Expires ${escapeHtml(formatDate(voucher.expiryDate))}</span>
        </div>
        <button class="btn primary redeem-btn" data-id="${escapeHtml(voucher.id)}" ${disabled ? "disabled" : ""}>${label}</button>
      </article>`;
  }).join("");

  $$(".redeem-btn").forEach((button) => {
    button.addEventListener("click", () => openRedeemModal(button.dataset.id));
  });
}

function renderCoupons() {
  const list = $("#couponList");
  if (coupons.length === 0) {
    list.innerHTML = `<div class="state-card">No coupons yet. Redeem a reward to get your first code.</div>`;
    return;
  }
  list.innerHTML = coupons.map((coupon) => {
    const used = coupon.status === "USED";
    return `
      <div class="coupon-card">
        <div class="tx-main">
          <strong>${escapeHtml(coupon.title)}</strong>
          <div class="coupon-code">${escapeHtml(coupon.couponCode)}</div>
          <div class="coupon-meta">Redeemed ${formatDate(coupon.redeemedAt)} · Expires ${formatDate(coupon.expiryDate)}</div>
        </div>
        <div style="display:grid;gap:8px;justify-items:end">
          <span class="badge ${used ? "used" : "active"}">${used ? "USED" : "ACTIVE"}</span>
          <button class="btn ghost copy-btn" data-code="${escapeHtml(coupon.couponCode)}">Copy Code</button>
        </div>
      </div>`;
  }).join("");

  $$(".copy-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.code);
        toast("Coupon code copied!");
      } catch (_) {
        toast(`Coupon code: ${button.dataset.code}`);
      }
    });
  });
}

function showTab(tab) {
  activeTab = tab;
  $$(".tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  $("#redeemPanel").hidden = tab !== "redeem";
  $("#couponPanel").hidden = tab !== "coupons";
}

function openRedeemModal(voucherId) {
  const voucher = vouchers.find((v) => v.id === voucherId);
  if (!voucher) return;
  const balance = summary ? summary.balance : 0;
  const remaining = balance - Number(voucher.pointsRequired);
  pendingRedemption = { voucherId, voucherTitle: voucher.title, remaining };

  $("#modalTitle").textContent = "Confirm redemption";
  $("#modalBody").innerHTML = `
    <p>Redeem <strong>${escapeHtml(voucher.title)}</strong> for <strong>${voucher.pointsRequired} pts</strong>?</p>
    <p>Remaining points after redemption: <strong>${remaining}</strong></p>`;
  $("#modalConfirm").textContent = "Confirm";
  $("#modalConfirm").disabled = false;
  $("#modalBackdrop").hidden = false;
}

function closeModal() {
  $("#modalBackdrop").hidden = true;
  pendingRedemption = null;
}

async function confirmRedeem() {
  if (!pendingRedemption) return;
  const button = $("#modalConfirm");
  button.disabled = true;
  button.textContent = "Redeeming…";
  try {
    const result = await api("/api/rewards/redeem", {
      method: "POST",
      body: JSON.stringify({ userId: getUserId(), voucherId: pendingRedemption.voucherId }),
    });
    $("#modalTitle").textContent = "Reward unlocked!";
    $("#modalBody").innerHTML = `
      <p>Show this code at the counter.</p>
      <div class="coupon-reveal">
        <div class="coupon-code">${escapeHtml(result.couponCode)}</div>
        <div class="coupon-meta">${result.remainingPoints} points remaining</div>
      </div>`;
    button.textContent = "Done";
    button.disabled = false;
    pendingRedemption = null;
    toast("Reward redeemed successfully!");
    await Promise.all([loadWallet(), loadStore()]);
  } catch (error) {
    toast(error.message, true);
    closeModal();
  }
}

$$(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    transactionFilter = button.dataset.filter;
    $$(".filter").forEach((el) => el.classList.toggle("active", el === button));
    renderTransactions();
  });
});

$$(".tab").forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});

$("#modalClose").addEventListener("click", closeModal);
$("#modalCancel").addEventListener("click", closeModal);
$("#modalConfirm").addEventListener("click", confirmRedeem);
$("#modalBackdrop").addEventListener("click", (event) => {
  if (event.target.id === "modalBackdrop") closeModal();
});

userIdInput.addEventListener("change", () => {
  loadWallet().then(loadStore);
});

Promise.all([loadWallet(), loadStore()]);
