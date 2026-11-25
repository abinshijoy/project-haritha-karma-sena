/* Billing, history, admin/HKS console and receipt UI for the unified app. */

'use strict';

const page = document.body.dataset.page || 'home';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const api = (path, options) => window.HKS.api(path, options);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function formatMoney(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2,
  }).format(Number(paise || 0) / 100);
}

function monthLabel(value) {
  if (!value) return '—';
  const [year, month] = String(value).slice(0, 10).split('-');
  return `${MONTH_NAMES[Number(month) - 1] || month} ${year}`;
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function invoiceStatus(invoice) {
  if (invoice.status === 'paid') return 'paid';
  const due = new Date(`${String(invoice.due_date || '').slice(0, 10)}T23:59:59`);
  return due < new Date() ? 'overdue' : 'pending';
}

function statusBadge(status) {
  return `<span class="pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function setMessage(element, text, type = 'info') {
  if (!element) return;
  if (!text) {
    element.classList.add('hidden');
    element.textContent = '';
    return;
  }
  element.className = `notice ${type}`;
  element.textContent = text;
}

function setBusy(button, busy, busyText = 'Working…') {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent.trim();
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.originalText;
}

function currentMonthInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function signedInUser() {
  return window.HKS && window.HKS.user;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
async function initHome() {
  try {
    const [health, config] = await Promise.all([api('/api/health'), api('/api/config')]);
    if ($('#dbStatus')) $('#dbStatus').textContent = `${health.db} · ${health.ok ? 'all systems ready' : 'checking…'}`;
    if ($('#gatewayStatus')) {
      $('#gatewayStatus').textContent = `UPI ID ${config.upiId} · demo OTP ${config.demoOtp}`;
    }
  } catch (_) {
    setMessage($('#homeMsg'), 'Server metadata could not be loaded.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Pay page
// ---------------------------------------------------------------------------
const payState = { config: null, invoices: [], selected: null, method: 'upi' };

async function initPay() {
  if (!signedInUser()) return;
  try {
    payState.config = await api('/api/config');
    $('#upiIdText').textContent = payState.config.upiId;
    const phoneInput = $('#phoneInput');
    if (phoneInput && signedInUser().role !== 'ADMIN') {
      phoneInput.value = signedInUser().phone || '';
    }
    const razorpayTab = $('[data-method="razorpay"]');
    if (razorpayTab) razorpayTab.disabled = true;
    selectMethod('upi');
    if (phoneInput && phoneInput.value) $('#lookupForm').requestSubmit();
  } catch (error) {
    setMessage($('#lookupMsg'), error.message, 'error');
  }

  $('#lookupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#lookupBtn');
    setBusy(button, true, 'Searching…');
    setMessage($('#lookupMsg'), '');
    $('#memberPanel').classList.add('hidden');
    $('#payPanel').classList.add('hidden');
    $('#resultPanel').classList.add('hidden');
    try {
      const data = await api(`/api/history?phone=${encodeURIComponent($('#phoneInput').value.trim())}`);
      payState.invoices = data.invoices.filter((invoice) => invoice.status !== 'paid');
      $('#memberName').textContent = `${data.member.name} · ${data.member.phone}`;
      renderInvoiceOptions();
      $('#memberPanel').classList.remove('hidden');
      if (!payState.invoices.length) {
        setMessage($('#lookupMsg'), 'No unpaid invoices found. Bills are generated at the start of each month.', 'info');
      }
    } catch (error) {
      setMessage($('#lookupMsg'), error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $$('[data-method]').forEach((tab) => tab.addEventListener('click', () => selectMethod(tab.dataset.method)));
  $('#upiForm').addEventListener('submit', submitUpiPayment);
}

function renderInvoiceOptions() {
  const list = $('#invoiceList');
  if (!payState.invoices.length) {
    list.innerHTML = '<p class="muted">Nothing to pay right now.</p>';
    return;
  }
  list.innerHTML = payState.invoices.map((invoice, index) => `
    <label class="invoice-option">
      <input type="radio" name="invoiceId" value="${escapeHtml(invoice.id)}" ${index === 0 ? 'checked' : ''} />
      <span>
        <strong>${escapeHtml(invoice.invoice_no)} — ${formatMoney(invoice.amount_paise)}</strong>
        <span class="muted small">${monthLabel(invoice.billing_month)} · due ${dateLabel(invoice.due_date)} · ${statusBadge(invoiceStatus(invoice))}</span>
      </span>
    </label>`).join('');
  $$('input[name="invoiceId"]', list).forEach((radio) => {
    radio.addEventListener('change', () => {
      payState.selected = payState.invoices.find((invoice) => invoice.id === radio.value);
      updatePayPanel();
    });
  });
  payState.selected = payState.invoices[0];
  updatePayPanel();
}

function updatePayPanel() {
  const invoice = payState.selected;
  if (!invoice) return;
  $('#payPanel').classList.remove('hidden');
  $('#invoiceSummary').innerHTML = `
    <strong>${escapeHtml(invoice.invoice_no)}</strong> · ${monthLabel(invoice.billing_month)} ·
    <strong>${formatMoney(invoice.amount_paise)}</strong>`;
  $('#upiQr').src = `/api/payments/upi/qr?invoiceId=${encodeURIComponent(invoice.id)}`;
  const params = new URLSearchParams({
    pa: payState.config?.upiId || '',
    pn: payState.config?.upiName || 'Haritha Karma Sena',
    am: (Number(invoice.amount_paise) / 100).toFixed(2),
    cu: payState.config?.currency || 'INR',
    tn: `HKS monthly fee ${monthLabel(invoice.billing_month)}`,
  });
  $('#upiLink').href = `upi://pay?${params.toString()}`;
  $('#resultPanel').classList.add('hidden');
  setMessage($('#upiMsg'), '');
}

function selectMethod(method) {
  payState.method = method;
  $$('[data-method]').forEach((tab) => tab.classList.toggle('active', tab.dataset.method === method));
  $('#razorpayPane').classList.toggle('hidden', method !== 'razorpay');
  $('#upiPane').classList.toggle('hidden', method !== 'upi');
  $('#cashPane').classList.toggle('hidden', method !== 'cash');
}

async function submitUpiPayment(event) {
  event.preventDefault();
  if (!payState.selected) return;
  const button = $('#submitUpi');
  setBusy(button, true, 'Submitting…');
  setMessage($('#upiMsg'), '');
  try {
    const result = await api('/api/payments/upi', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: payState.selected.id, upiRef: $('#upiRef').value.trim() }),
    });
    showPaymentSuccess(
      result,
      'UPI reference submitted. An admin will verify it and issue your receipt shortly.'
    );
    $('#upiRef').value = '';
  } catch (error) {
    setMessage($('#upiMsg'), error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

function showPaymentSuccess(result, message) {
  const panel = $('#resultPanel');
  panel.classList.remove('hidden');
  const points = result.pointsAwarded
    ? `<div class="notice success">🌿 +${result.pointsAwarded} Green Points added to your wallet.</div>`
    : '';
  $('#resultMsg').innerHTML = `
    <div class="notice info">${escapeHtml(message)}</div>
    ${points}
    ${result.receiptUrl ? `<p><a class="btn btn-primary" href="${escapeHtml(result.receiptUrl)}">View digital receipt · ${escapeHtml(result.receiptNo || '')}</a></p>` : ''}`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------------------------------------------------------------------------
// Payment history
// ---------------------------------------------------------------------------
const historyState = { data: null };

function initHistory() {
  if (!signedInUser()) return;
  const phoneInput = $('#historyPhone');
  if (phoneInput && signedInUser().role !== 'ADMIN') phoneInput.value = signedInUser().phone || '';

  $('#historyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#historyBtn');
    setBusy(button, true, 'Searching…');
    setMessage($('#historyMsg'), '');
    try {
      historyState.data = await api(`/api/history?phone=${encodeURIComponent($('#historyPhone').value.trim())}`);
      $('#historyResults').classList.remove('hidden');
      renderHistory();
    } catch (error) {
      $('#historyResults').classList.add('hidden');
      setMessage($('#historyMsg'), error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#statusFilter').addEventListener('change', renderHistory);
  if (phoneInput && phoneInput.value) $('#historyForm').requestSubmit();
}

async function renderHistory() {
  if (!historyState.data) return;
  const { member, invoices, summary } = historyState.data;
  const filter = $('#statusFilter').value;
  $('#historyMember').textContent = `${member.name} · ${member.phone}${member.ward ? ` · ${member.ward}` : ''}`;
  $('#summaryPaid').textContent = formatMoney(summary.totalPaidPaise);
  $('#summaryPending').textContent = String(summary.pendingCount);
  $('#summaryCount').textContent = String(summary.invoiceCount);
  if ($('#summaryPoints')) {
    try {
      const wallet = await api('/api/rewards/summary');
      $('#summaryPoints').textContent = String(wallet.balance);
    } catch (_) {
      $('#summaryPoints').textContent = String(summary.pointsBalance ?? 0);
    }
  }

  const visible = invoices.filter((invoice) => !filter || invoiceStatus(invoice) === filter);
  $('#historyRows').innerHTML = visible.length
    ? visible.map((invoice) => {
        const paidPayment = invoice.payments.find((payment) => payment.status === 'paid');
        const latest = invoice.payments[0];
        const method = paidPayment?.method || latest?.method || '—';
        const points = paidPayment ? '<span class="mini-points">+50 pts</span>' : '';
        return `
          <tr>
            <td><strong>${escapeHtml(invoice.invoice_no)}</strong><br><span class="muted small">${monthLabel(invoice.billing_month)}</span></td>
            <td>${formatMoney(invoice.amount_paise)}</td>
            <td>${dateLabel(invoice.due_date)}</td>
            <td>${statusBadge(invoiceStatus(invoice))} ${points}</td>
            <td>${escapeHtml(method)}</td>
            <td>${paidPayment ? dateLabel(paidPayment.paid_at) : '—'}</td>
            <td>${paidPayment
              ? `<a href="/receipt.html?id=${encodeURIComponent(paidPayment.id)}">Receipt ↗</a>`
              : '<span class="muted">—</span>'}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="7" class="muted center">No invoices match this filter.</td></tr>';
}

// ---------------------------------------------------------------------------
// Admin / HKS console
// ---------------------------------------------------------------------------
const adminState = { data: null };

async function initAdmin() {
  if (!signedInUser() || signedInUser().role !== 'ADMIN') return;
  await refreshAdmin();

  $('#generateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#generateBtn');
    setBusy(button, true, 'Generating…');
    try {
      const result = await api('/api/admin/invoices/generate', {
        method: 'POST', body: JSON.stringify({ month: $('#generateMonth').value }),
      });
      setMessage(
        $('#generateMsg'),
        `${result.created} invoice(s) created, ${result.skipped} already existed for ${monthLabel(result.billingMonth)}. Due date: ${dateLabel(result.dueDate)}.`,
        'success'
      );
      await refreshAdmin();
    } catch (error) {
      setMessage($('#generateMsg'), error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#memberForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#memberBtn');
    setBusy(button, true, 'Adding…');
    try {
      await api('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify({
          fullName: $('#memberName').value.trim(),
          phone: $('#memberPhone').value.trim(),
          email: $('#memberEmail').value.trim(),
          ward: $('#memberWard').value.trim(),
        }),
      });
      $('#memberForm').reset();
      setMessage($('#memberMsg'), 'Member added and available for billing immediately.', 'success');
      await refreshAdmin();
    } catch (error) {
      setMessage($('#memberMsg'), error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#cashPhone').addEventListener('change', loadCashInvoices);
  $('#cashForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#cashBtn');
    setBusy(button, true, 'Recording…');
    try {
      const result = await api('/api/payments/cash', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: $('#cashInvoice').value,
          collectedBy: $('#cashCollector').value.trim(),
          reference: $('#cashReference').value.trim(),
        }),
      });
      setMessage(
        $('#cashMsg'),
        `Cash payment recorded. Receipt: ${result.receiptNo}. ${result.pointsAwarded ? `+${result.pointsAwarded} Green Points credited.` : ''}`,
        'success'
      );
      $('#cashReference').value = '';
      await loadCashInvoices();
      await refreshAdmin();
    } catch (error) {
      setMessage($('#cashMsg'), error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#segregationForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#segregationBtn');
    setBusy(button, true, 'Verifying…');
    try {
      const result = await api('/api/admin/collections/verify', {
        method: 'POST',
        body: JSON.stringify({
          phone: $('#segregationPhone').value.trim(),
          collectionReference: $('#segregationRef').value.trim(),
          verifiedBy: signedInUser().name || 'HKS Worker',
          ward: $('#segregationWard').value.trim(),
        }),
      });
      setMessage($('#segregationMsg'), `Verified. +${result.pointsAwarded} Green Points credited to ${result.collection.memberName}.`, 'success');
      $('#segregationRef').value = '';
      await refreshAdmin();
    } catch (error) {
      setMessage($('#segregationMsg'), error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#paymentTable').addEventListener('click', handlePaymentAction);
  $('#pendingTable').addEventListener('click', handlePaymentAction);
  $('#generateMonth').value = currentMonthInput();
}

async function refreshAdmin() {
  const [overview, members, invoices, pending, payments, collections] = await Promise.all([
    api('/api/admin/overview'),
    api('/api/admin/members'),
    api('/api/admin/invoices'),
    api('/api/admin/payments?status=pending'),
    api('/api/admin/payments'),
    api('/api/admin/collections'),
  ]);
  adminState.data = {
    overview, members: members.members, invoices: invoices.invoices,
    pending: pending.payments, payments: payments.payments, collections: collections.collections,
  };

  $('#statMembers').textContent = String(overview.active_members);
  $('#statPendingInvoices').textContent = String(overview.pending_invoices);
  $('#statCollectedMonth').textContent = formatMoney(overview.collected_this_month_paise);
  $('#statPendingVerification').textContent = String(overview.pending_verifications);
  $('#statTotalCollected').textContent = formatMoney(overview.total_collected_paise);
  if ($('#statRewardPoints')) $('#statRewardPoints').textContent = String(overview.total_green_points);

  $('#memberRows').innerHTML = adminState.data.members.length
    ? adminState.data.members.map((member) => `
        <tr>
          <td><strong>${escapeHtml(member.name)}</strong></td>
          <td>${escapeHtml(member.phone)}</td>
          <td>${escapeHtml(member.email || '—')}</td>
          <td>${escapeHtml(member.ward || '—')}</td>
          <td>${escapeHtml(member.role)}</td>
          <td>${member.isActive ? 'Active' : 'Inactive'}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="muted center">No members yet.</td></tr>';

  $('#invoiceRows').innerHTML = adminState.data.invoices.length
    ? adminState.data.invoices.slice(0, 60).map((invoice) => `
        <tr>
          <td>${escapeHtml(invoice.invoice_no)}</td>
          <td>${escapeHtml(invoice.full_name)}<br><span class="muted small">${escapeHtml(invoice.phone)}</span></td>
          <td>${monthLabel(invoice.billing_month)}</td>
          <td>${formatMoney(invoice.amount_paise)}</td>
          <td>${dateLabel(invoice.due_date)}</td>
          <td>${statusBadge(invoice.status)}</td>
          <td>${invoice.receipt_no ? `<a href="/receipt.html?id=${encodeURIComponent(invoice.payment_id)}">Receipt</a>` : '—'}</td>
        </tr>`).join('')
    : '<tr><td colspan="7" class="muted center">No invoices yet.</td></tr>';

  const paymentRow = (payment, withActions) => `
    <tr>
      <td>${escapeHtml(payment.invoice_no)}</td>
      <td>${escapeHtml(payment.full_name)}<br><span class="muted small">${escapeHtml(payment.phone)}</span></td>
      <td>${escapeHtml(payment.method)}</td>
      <td>${escapeHtml(payment.upi_ref || payment.reference || payment.razorpay_payment_id || '—')}</td>
      <td>${statusBadge(payment.status)}</td>
      <td>${dateLabel(payment.paid_at || payment.created_at)}</td>
      <td>
        ${payment.receipt_no
          ? `<a href="/receipt.html?id=${encodeURIComponent(payment.id)}">Receipt</a>`
          : withActions
            ? `<button class="btn btn-small btn-primary" data-verify="${escapeHtml(payment.id)}" type="button">Verify</button>
               <button class="btn btn-small btn-danger" data-reject="${escapeHtml(payment.id)}" type="button">Reject</button>`
            : '—'}
      </td>
    </tr>`;

  $('#pendingRows').innerHTML = adminState.data.pending.length
    ? adminState.data.pending.map((payment) => paymentRow(payment, true)).join('')
    : '<tr><td colspan="7" class="muted center">No payments awaiting verification.</td></tr>';
  $('#paymentRows').innerHTML = adminState.data.payments.length
    ? adminState.data.payments.slice(0, 80).map((payment) => paymentRow(payment, false)).join('')
    : '<tr><td colspan="7" class="muted center">No payments recorded yet.</td></tr>';

  $('#collectionRows').innerHTML = adminState.data.collections.length
    ? adminState.data.collections.map((item) => `
        <tr>
          <td>${escapeHtml(item.memberName)}<br><span class="muted small">${escapeHtml(item.phone)}</span></td>
          <td>${escapeHtml(item.collectionId)}</td>
          <td>${escapeHtml(item.ward || '—')}</td>
          <td>${escapeHtml(item.verifiedBy || '—')}</td>
          <td>${statusBadge(item.status.toLowerCase())}</td>
          <td>${dateLabel(item.createdAt)}</td>
          <td><span class="mini-points">+20 pts</span></td>
        </tr>`).join('')
    : '<tr><td colspan="7" class="muted center">No verified collections yet.</td></tr>';
}

async function loadCashInvoices() {
  const phone = $('#cashPhone').value.trim();
  const select = $('#cashInvoice');
  select.innerHTML = '<option value="">Loading…</option>';
  if (!phone) {
    select.innerHTML = '<option value="">Enter a phone number first</option>';
    return;
  }
  try {
    const data = await api(`/api/history?phone=${encodeURIComponent(phone)}`);
    const unpaid = data.invoices.filter((invoice) => invoice.status !== 'paid');
    select.innerHTML = unpaid.length
      ? unpaid.map((invoice) => `<option value="${escapeHtml(invoice.id)}">${escapeHtml(invoice.invoice_no)} · ${monthLabel(invoice.billing_month)} · ${formatMoney(invoice.amount_paise)}</option>`).join('')
      : '<option value="">No unpaid invoices</option>';
  } catch (error) {
    select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`;
  }
}

async function handlePaymentAction(event) {
  const verifyId = event.target.closest('[data-verify]')?.dataset.verify;
  const rejectId = event.target.closest('[data-reject]')?.dataset.reject;
  if (!verifyId && !rejectId) return;
  try {
    if (verifyId) {
      const result = await api(`/api/admin/payments/${verifyId}/verify`, {
        method: 'POST', body: JSON.stringify({ verifiedBy: signedInUser().name || 'admin' }),
      });
      window.alert(`Payment verified. Receipt ${result.payment.receiptNo} issued. ${result.pointsAwarded ? `+${result.pointsAwarded} Green Points credited.` : ''}`);
    } else {
      const reason = window.prompt('Reason for rejection:', 'UTR could not be matched') || 'Manual payment could not be verified.';
      await api(`/api/admin/payments/${rejectId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    }
    await refreshAdmin();
  } catch (error) {
    window.alert(error.message);
  }
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------
async function initReceipt() {
  const paymentId = new URLSearchParams(window.location.search).get('id');
  if (!paymentId) {
    setMessage($('#receiptMsg'), 'Receipt link is missing an id.', 'error');
    return;
  }
  try {
    const receipt = await api(`/api/receipts/${encodeURIComponent(paymentId)}`);
    document.title = `Receipt ${receipt.receipt_no} — Haritha Karma Sena`;
    renderReceipt(receipt);
  } catch (error) {
    setMessage($('#receiptMsg'), error.message, 'error');
  }
  $('#printBtn').addEventListener('click', () => window.print());
}

function renderReceipt(receipt) {
  const methodLabel = {
    razorpay: 'Razorpay (online)', upi: 'UPI (manual verification)', cash: 'Cash',
  }[receipt.method] || receipt.method;
  const transaction = receipt.razorpay_payment_id || receipt.upi_ref || receipt.reference || '—';
  $('#receiptContent').innerHTML = `
    <div class="receipt-top">
      <div>
        <div class="eyebrow">Haritha Karma Sena</div>
        <h1>Digital receipt</h1>
        <div class="muted">Monthly membership fee · ${escapeHtml(receipt.monthLabel)}</div>
      </div>
      <div class="receipt-meta">
        <strong>${escapeHtml(receipt.receipt_no)}</strong><br>
        ${dateLabel(receipt.paid_at)}<br>
        <span class="pill paid">Paid</span>
      </div>
    </div>
    <div class="muted small">Receipt for</div>
    <h3>${escapeHtml(receipt.full_name)}</h3>
    <div class="muted small">${escapeHtml(receipt.phone)}${receipt.email ? ` · ${escapeHtml(receipt.email)}` : ''}${receipt.ward ? ` · ${escapeHtml(receipt.ward)}` : ''}</div>
    <table class="receipt-table" style="margin-top:26px">
      <tr><td>Invoice number</td><td><strong>${escapeHtml(receipt.invoice_no)}</strong></td></tr>
      <tr><td>Billing period</td><td>${escapeHtml(receipt.monthLabel)}</td></tr>
      <tr><td>Invoice due date</td><td>${dateLabel(receipt.due_date)}</td></tr>
      <tr><td>Payment method</td><td>${escapeHtml(methodLabel)}</td></tr>
      <tr><td>Transaction / UTR</td><td>${escapeHtml(transaction)}</td></tr>
      <tr><td>Collected by</td><td>${escapeHtml(receipt.collected_by || receipt.verified_by || '—')}</td></tr>
      <tr><td>Amount paid</td><td><span class="receipt-amount">${escapeHtml(receipt.formattedAmount)}</span></td></tr>
      <tr><td>Amount in words</td><td>${escapeHtml(receipt.amountWords)}</td></tr>
    </table>
    <p class="notice success" style="margin-top:24px">Payment received in full. No further payment is due for this billing period.</p>
    <div class="receipt-footer">
      <div>
        <strong>This is a computer-generated receipt.</strong><br>
        Verify online at ${escapeHtml(receipt.verificationUrl || window.location.href)}<br>
        Haritha Karma Sena · Waste management &amp; cleanliness mission
      </div>
      <img src="/api/receipts/${encodeURIComponent(receipt.id)}/qr" alt="Receipt verification QR code" />
    </div>`;
}

// ---------------------------------------------------------------------------
const initialisers = { home: initHome, pay: initPay, history: initHistory, admin: initAdmin, receipt: initReceipt };

document.addEventListener('DOMContentLoaded', () => {
  window.HKS.ready().then(() => {
    if (initialisers[page]) initialisers[page]();
  });
  window.addEventListener('hks:auth', () => {
    if (page === 'admin' && signedInUser()?.role === 'ADMIN') refreshAdmin().catch(() => {});
  });
});
