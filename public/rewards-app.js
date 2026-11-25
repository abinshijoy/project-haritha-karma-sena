/* Green Points wallet + voucher store, powered by the shared HKS session. */

'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const api = (path, options) => window.HKS.api(path, options);

let summary = null;
let vouchers = [];
let coupons = [];
let transactionFilter = 'ALL';
let activeTab = 'redeem';
let pendingRedemption = null;
let toastTimer = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function tierFor(balance) {
  if (balance >= 500) return { name: 'Haritha Champion', next: null, pointsToNext: 0 };
  if (balance >= 200) return { name: 'Green Guardian', next: 'Haritha Champion', pointsToNext: 500 - balance };
  return { name: 'Eco Starter', next: 'Green Guardian', pointsToNext: 200 - balance };
}

async function loadWallet() {
  $('#walletLoading').hidden = false;
  $('#walletContent').hidden = true;
  try {
    summary = await api('/api/rewards/summary');
    renderWallet();
    $('#walletLoading').hidden = true;
    $('#walletContent').hidden = false;
  } catch (error) {
    $('#walletLoading').textContent = `Could not load wallet: ${error.message}`;
  }
}

function renderWallet() {
  const balance = Number(summary.balance || 0);
  const tier = summary.tierProgress || tierFor(balance);
  $('#balance').textContent = balance;
  $('#tierBadge').textContent = summary.tier || tier.name;
  const member = window.HKS.user;
  if ($('#walletOwner')) {
    $('#walletOwner').textContent = member ? `${member.name} · ${member.phone}` : 'Member';
  }

  if (tier.next) {
    const floor = tier.name === 'Eco Starter' ? 0 : 200;
    const span = tier.pointsToNext + (balance - floor);
    const progress = span > 0 ? Math.round(((balance - floor) / span) * 100) : 0;
    $('#progressFrom').textContent = tier.name;
    $('#progressTo').textContent = tier.next;
    $('#progressFill').style.width = `${Math.min(100, Math.max(0, progress))}%`;
    $('#progressHint').textContent = `${tier.pointsToNext} more points to reach ${tier.next}.`;
  } else {
    $('#progressFrom').textContent = 'Haritha Champion';
    $('#progressTo').textContent = 'Top tier';
    $('#progressFill').style.width = '100%';
    $('#progressHint').textContent = "You've reached the highest eco level. Keep it up!";
  }
  renderTransactions();
}

function renderTransactions() {
  const list = $('#transactionList');
  const transactions = (summary.transactions || []).filter((tx) =>
    transactionFilter === 'ALL' ? true : tx.type === transactionFilter
  );
  if (!transactions.length) {
    list.innerHTML = '<div class="state-card">No transactions yet. Pay your HKS bill or get verified for clean segregation to earn points.</div>';
    return;
  }
  list.innerHTML = transactions.map((tx) => {
    const earned = tx.type === 'EARN';
    const points = Math.abs(Number(tx.points || 0));
    return `
      <div class="tx-row">
        <div class="tx-main">
          <strong>${escapeHtml(tx.reason)}</strong>
          <small>${formatDate(tx.createdAt)} · ${earned ? 'Earned' : 'Redeemed'}</small>
        </div>
        <div class="tx-points ${earned ? 'plus' : 'minus'}">${earned ? '+' : '−'}${points}</div>
      </div>`;
  }).join('');
}

async function loadStore() {
  $('#storeLoading').hidden = false;
  $('#redeemPanel').hidden = true;
  $('#couponPanel').hidden = true;
  try {
    const [voucherData, couponData] = await Promise.all([
      api('/api/rewards/vouchers'),
      api('/api/rewards/coupons'),
    ]);
    vouchers = voucherData.vouchers || [];
    coupons = couponData.coupons || [];
    renderVouchers();
    renderCoupons();
    $('#storeLoading').hidden = true;
    showTab(activeTab);
  } catch (error) {
    $('#storeLoading').textContent = `Could not load rewards: ${error.message}`;
  }
}

function renderVouchers() {
  const grid = $('#voucherGrid');
  const balance = summary ? Number(summary.balance || 0) : 0;
  if (!vouchers.length) {
    grid.innerHTML = '<div class="state-card">No vouchers available right now.</div>';
    return;
  }
  grid.innerHTML = vouchers.map((voucher) => {
    const cost = Number(voucher.pointsRequired || 0);
    const stock = Number(voucher.stock || 0);
    const disabled = stock <= 0 || balance < cost;
    const label = stock <= 0 ? 'Out of stock' : balance < cost ? 'Not enough points' : 'Redeem';
    return `
      <article class="voucher-card">
        <span class="voucher-category">${escapeHtml(voucher.category || 'reward')}</span>
        <h3>${escapeHtml(voucher.title)}</h3>
        <p>${escapeHtml(voucher.description)}</p>
        <div class="voucher-meta">
          <span class="cost">${cost} pts</span>
          <span class="coupon-meta">${stock} left</span>
        </div>
        <div class="voucher-meta">
          <span class="coupon-meta">Expires ${escapeHtml(formatDate(voucher.expiryDate))}</span>
        </div>
        <button class="btn primary redeem-btn" data-id="${escapeHtml(voucher.id)}" type="button" ${disabled ? 'disabled' : ''}>${label}</button>
      </article>`;
  }).join('');
  $$('.redeem-btn').forEach((button) => button.addEventListener('click', () => openRedeemModal(button.dataset.id)));
}

function renderCoupons() {
  const list = $('#couponList');
  if (!coupons.length) {
    list.innerHTML = '<div class="state-card">No coupons yet. Redeem a reward to get your first code.</div>';
    return;
  }
  list.innerHTML = coupons.map((coupon) => {
    const used = coupon.status === 'USED';
    return `
      <div class="coupon-card">
        <div class="tx-main">
          <strong>${escapeHtml(coupon.title)}</strong>
          <div class="coupon-code">${escapeHtml(coupon.couponCode)}</div>
          <div class="coupon-meta">Redeemed ${formatDate(coupon.redeemedAt)} · Expires ${formatDate(coupon.expiryDate)}</div>
        </div>
        <div class="coupon-actions">
          <span class="badge ${used ? 'used' : 'active'}">${used ? 'USED' : 'ACTIVE'}</span>
          <button class="btn ghost copy-btn" data-code="${escapeHtml(coupon.couponCode)}" type="button">Copy code</button>
        </div>
      </div>`;
  }).join('');
  $$('.copy-btn').forEach((button) => button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.code);
      toast('Coupon code copied!');
    } catch (_) {
      toast(`Coupon code: ${button.dataset.code}`);
    }
  }));
}

function showTab(tab) {
  activeTab = tab;
  $$('.tab').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
  $('#redeemPanel').hidden = tab !== 'redeem';
  $('#couponPanel').hidden = tab !== 'coupons';
}

function openRedeemModal(voucherId) {
  const voucher = vouchers.find((item) => item.id === voucherId);
  if (!voucher) return;
  const balance = summary ? Number(summary.balance || 0) : 0;
  const remaining = balance - Number(voucher.pointsRequired);
  pendingRedemption = { voucherId, voucherTitle: voucher.title, remaining };
  $('#modalTitle').textContent = 'Confirm redemption';
  $('#modalBody').innerHTML = `
    <p>Redeem <strong>${escapeHtml(voucher.title)}</strong> for <strong>${voucher.pointsRequired} pts</strong>?</p>
    <p>Remaining points after redemption: <strong>${remaining}</strong></p>`;
  $('#modalConfirm').textContent = 'Confirm';
  $('#modalConfirm').disabled = false;
  $('#modalBackdrop').hidden = false;
}

function closeModal() {
  $('#modalBackdrop').hidden = true;
  pendingRedemption = null;
}

async function confirmRedeem() {
  if (!pendingRedemption) {
    closeModal();
    $('#modalConfirm').textContent = 'Confirm';
    return;
  }
  const button = $('#modalConfirm');
  button.disabled = true;
  button.textContent = 'Redeeming…';
  try {
    const result = await api('/api/rewards/redeem', {
      method: 'POST', body: JSON.stringify({ voucherId: pendingRedemption.voucherId }),
    });
    $('#modalTitle').textContent = 'Reward unlocked!';
    $('#modalBody').innerHTML = `
      <p>Show this code at the counter.</p>
      <div class="coupon-reveal">
        <div class="coupon-code">${escapeHtml(result.couponCode)}</div>
        <div class="coupon-meta">${result.remainingPoints} points remaining</div>
      </div>`;
    button.textContent = 'Done';
    button.disabled = false;
    pendingRedemption = null;
    toast('Reward redeemed successfully!');
    await Promise.all([loadWallet(), loadStore()]);
  } catch (error) {
    toast(error.message, true);
    closeModal();
  }
}

async function demoAward(button, endpoint, message) {
  button.disabled = true;
  try {
    await api(endpoint, { method: 'POST', body: '{}' });
    toast(message);
    await Promise.all([loadWallet(), loadStore()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

$$('.filter').forEach((button) => button.addEventListener('click', () => {
  transactionFilter = button.dataset.filter;
  $$('.filter').forEach((el) => el.classList.toggle('active', el === button));
  renderTransactions();
}));
$$('.tab').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));

$('#demoPayment').addEventListener('click', (event) => demoAward(
  event.currentTarget,
  '/api/demo/earn-payment',
  '+50 Green Points awarded for a demo bill payment.'
));
$('#demoSegregation').addEventListener('click', (event) => demoAward(
  event.currentTarget,
  '/api/demo/earn-segregation',
  '+20 Green Points awarded for verified segregation.'
));

$('#modalClose').addEventListener('click', closeModal);
$('#modalCancel').addEventListener('click', closeModal);
$('#modalConfirm').addEventListener('click', confirmRedeem);
$('#modalBackdrop').addEventListener('click', (event) => {
  if (event.target.id === 'modalBackdrop') closeModal();
});

document.addEventListener('DOMContentLoaded', () => {
  window.HKS.ready().then((user) => {
    if (!user) return;
    Promise.all([loadWallet(), loadStore()]);
  });
});
