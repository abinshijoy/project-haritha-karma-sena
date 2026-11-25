'use strict';

const page = document.body.dataset.page || 'home';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(path, { ...options, headers });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatMoney(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2
  }).format(Number(paise || 0) / 100);
}

function monthLabel(value) {
  if (!value) return '—';
  const [year, month] = String(value).slice(0, 10).split('-');
  return `${MONTH_NAMES[Number(month) - 1] || month} ${year}`;
}

function dateLabel(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function invoiceStatus(invoice) {
  if (invoice.status === 'paid') return 'paid';
  const due = new Date(`${String(invoice.due_date).slice(0, 10)}T23:59:59`);
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

function setBusy(button, busy, busyText = 'Working…', originalText) {
  if (!button) return;
  button.disabled = busy;
  button.dataset.originalText = button.dataset.originalText || button.textContent.trim();
  button.textContent = busy ? busyText : originalText || button.dataset.originalText;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ($(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the Razorpay checkout script.'));
    document.head.appendChild(script);
  });
}

function currentMonthInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
async function initHome() {
  try {
    const data = await api('/api/health');
    const dbEl = $('#dbStatus');
    const payEl = $('#gatewayStatus');
    if (dbEl) dbEl.textContent = data.ok ? 'Database connected' : 'Database unavailable';
    if (payEl) {
      payEl.textContent = data.razorpayConfigured
        ? 'Razorpay enabled'
        : 'UPI & cash enabled';
    }
  } catch {
    setMessage($('#homeMsg'), 'Server metadata could not be loaded.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Pay page
// ---------------------------------------------------------------------------
const payState = {
  config: null,
  invoices: [],
  selected: null,
  method: 'razorpay'
};

async function initPay() {
  try {
    payState.config = await api('/api/config');
    $('#upiIdText').textContent = payState.config.upiId;
    const razorpayTab = $('[data-method="razorpay"]');
    if (!payState.config.razorpayConfigured) {
      razorpayTab.disabled = true;
      razorpayTab.title = 'Razorpay keys are not configured on this server.';
      selectMethod('upi');
    }
  } catch (err) {
    setMessage($('#lookupMsg'), err.message, 'error');
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
      const data = await api(`/api/members/lookup?phone=${encodeURIComponent($('#phoneInput').value.trim())}`);
      payState.invoices = data.invoices.filter((invoice) => invoice.status !== 'paid');
      $('#memberName').textContent = `${data.member.full_name} · ${data.member.phone}`;
      renderInvoiceOptions();
      $('#memberPanel').classList.remove('hidden');
      if (!payState.invoices.length) {
        setMessage($('#lookupMsg'), 'No unpaid invoices found. Bills are usually generated at the start of each month.', 'info');
      }
    } catch (err) {
      setMessage($('#lookupMsg'), err.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $$('[data-method]').forEach((tab) => {
    tab.addEventListener('click', () => selectMethod(tab.dataset.method));
  });

  $('#payWithRazorpay').addEventListener('click', payWithRazorpay);
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
    </label>
  `).join('');
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
  const upiParams = new URLSearchParams({
    pa: payState.config?.upiId || '',
    pn: payState.config?.upiName || 'Haritha Karma Sena',
    am: (Number(invoice.amount_paise) / 100).toFixed(2),
    cu: payState.config?.currency || 'INR',
    tn: `HKS monthly fee ${monthLabel(invoice.billing_month)}`
  });
  $('#upiLink').href = `upi://pay?${upiParams.toString()}`;
  $('#resultPanel').classList.add('hidden');
  setMessage($('#razorpayMsg'), '');
  setMessage($('#upiMsg'), '');
}

function selectMethod(method) {
  payState.method = method;
  $$('[data-method]').forEach((tab) => tab.classList.toggle('active', tab.dataset.method === method));
  $('#razorpayPane').classList.toggle('hidden', method !== 'razorpay');
  $('#upiPane').classList.toggle('hidden', method !== 'upi');
  $('#cashPane').classList.toggle('hidden', method !== 'cash');
}

async function payWithRazorpay() {
  if (!payState.selected) return;
  const button = $('#payWithRazorpay');
  setBusy(button, true, 'Opening checkout…');
  setMessage($('#razorpayMsg'), '');
  try {
    const order = await api('/api/payments/razorpay/order', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: payState.selected.id })
    });
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'Haritha Karma Sena',
      description: `Monthly fee · ${order.monthLabel}`,
      order_id: order.orderId,
      prefill: {
        name: order.memberName,
        contact: order.phone,
        email: order.email || ''
      },
      notes: { invoice_no: order.invoiceNo },
      theme: { color: '#17523f' },
      handler: (response) => verifyRazorpay(order.orderId, response),
      modal: {
        ondismiss: async () => {
          try {
            await api('/api/payments/razorpay/fail', {
              method: 'POST',
              body: JSON.stringify({ orderId: order.orderId, reason: 'Checkout closed by user' })
            });
          } catch {
            /* safe to ignore */
          }
        }
      }
    });
    checkout.on('payment.failed', async (response) => {
      try {
        await api('/api/payments/razorpay/fail', {
          method: 'POST',
          body: JSON.stringify({
            orderId: order.orderId,
            reason: response.error?.description || 'Payment failed'
          })
        });
      } catch {
        /* safe to ignore */
      }
      setMessage($('#razorpayMsg'), response.error?.description || 'Payment failed. Please try again.', 'error');
    });
    checkout.open();
  } catch (err) {
    setMessage($('#razorpayMsg'), err.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function verifyRazorpay(orderId, response) {
  try {
    const result = await api('/api/payments/razorpay/verify', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        paymentId: response.razorpay_payment_id,
        signature: response.razorpay_signature
      })
    });
    showPaymentSuccess(result, 'Payment received. Your digital receipt is ready.');
  } catch (err) {
    setMessage($('#razorpayMsg'), `Payment verification failed: ${err.message}`, 'error');
  }
}

async function submitUpiPayment(event) {
  event.preventDefault();
  const button = $('#submitUpi');
  setBusy(button, true, 'Submitting…');
  setMessage($('#upiMsg'), '');
  try {
    const result = await api('/api/payments/upi', {
      method: 'POST',
      body: JSON.stringify({
        invoiceId: payState.selected.id,
        upiRef: $('#upiRef').value.trim()
      })
    });
    showPaymentSuccess(
      result,
      'UPI reference submitted. An admin will verify it and issue your receipt shortly.'
    );
    $('#upiRef').value = '';
  } catch (err) {
    setMessage($('#upiMsg'), err.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

function showPaymentSuccess(result, message) {
  const panel = $('#resultPanel');
  panel.classList.remove('hidden');
  if (result.receiptUrl) {
    $('#resultMsg').innerHTML = `
      <div class="notice success">${escapeHtml(message)}</div>
      <p><a class="btn btn-primary" href="${escapeHtml(result.receiptUrl)}">View digital receipt · ${escapeHtml(result.receiptNo || '')}</a></p>`;
  } else {
    $('#resultMsg').innerHTML = `<div class="notice info">${escapeHtml(message)}</div>`;
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------------------------------------------------------------------------
// Payment history
// ---------------------------------------------------------------------------
const historyState = { data: null };

function initHistory() {
  $('#historyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#historyBtn');
    setBusy(button, true, 'Searching…');
    setMessage($('#historyMsg'), '');
    try {
      historyState.data = await api(
        `/api/members/lookup?phone=${encodeURIComponent($('#historyPhone').value.trim())}`
      );
      $('#historyResults').classList.remove('hidden');
      renderHistory();
    } catch (err) {
      $('#historyResults').classList.add('hidden');
      setMessage($('#historyMsg'), err.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#statusFilter').addEventListener('change', renderHistory);
}

function renderHistory() {
  if (!historyState.data) return;
  const { member, invoices, summary } = historyState.data;
  const filter = $('#statusFilter').value;
  $('#historyMember').textContent = `${member.full_name} · ${member.phone}${member.ward ? ` · ${member.ward}` : ''}`;
  $('#summaryPaid').textContent = formatMoney(summary.totalPaidPaise);
  $('#summaryPending').textContent = String(summary.pendingCount);
  $('#summaryCount').textContent = String(summary.invoiceCount);

  const visible = invoices.filter((invoice) => !filter || invoiceStatus(invoice) === filter);
  $('#historyRows').innerHTML = visible.length
    ? visible.map((invoice) => {
        const paidPayment = invoice.payments.find((payment) => payment.status === 'paid');
        const latest = invoice.payments[0];
        const method = paidPayment?.method || latest?.method || '—';
        return `
          <tr>
            <td><strong>${escapeHtml(invoice.invoice_no)}</strong><br><span class="muted small">${monthLabel(invoice.billing_month)}</span></td>
            <td>${formatMoney(invoice.amount_paise)}</td>
            <td>${dateLabel(invoice.due_date)}</td>
            <td>${statusBadge(invoiceStatus(invoice))}</td>
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
// Admin
// ---------------------------------------------------------------------------
const adminState = { token: '', data: null };

async function adminApi(path, options = {}) {
  return api(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminState.token}`,
      ...(options.headers || {})
    }
  });
}

async function initAdmin() {
  adminState.token = localStorage.getItem('hksAdminToken') || '';
  if (adminState.token) await enterAdmin();

  $('#adminLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    adminState.token = $('#adminToken').value.trim();
    try {
      await adminApi('/api/admin/overview');
      localStorage.setItem('hksAdminToken', adminState.token);
      await enterAdmin();
    } catch (err) {
      setMessage($('#adminLoginMsg'), err.message, 'error');
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('hksAdminToken');
    adminState.token = '';
    $('#adminDashboard').classList.add('hidden');
    $('#adminLogin').classList.remove('hidden');
    $('#adminToken').value = '';
  });

  $('#generateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#generateBtn');
    setBusy(button, true, 'Generating…');
    try {
      const result = await adminApi('/api/admin/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({ month: $('#generateMonth').value })
      });
      setMessage(
        $('#generateMsg'),
        `${result.created} invoice(s) created, ${result.skipped} already existed for ${monthLabel(result.billingMonth)}. Due date: ${dateLabel(result.dueDate)}.`,
        'success'
      );
      await refreshAdmin();
    } catch (err) {
      setMessage($('#generateMsg'), err.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#memberForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#memberBtn');
    setBusy(button, true, 'Adding…');
    try {
      await adminApi('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify({
          fullName: $('#memberName').value.trim(),
          phone: $('#memberPhone').value.trim(),
          email: $('#memberEmail').value.trim(),
          ward: $('#memberWard').value.trim()
        })
      });
      $('#memberForm').reset();
      setMessage($('#memberMsg'), 'Member added successfully.', 'success');
      await refreshAdmin();
    } catch (err) {
      setMessage($('#memberMsg'), err.message, 'error');
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
      const result = await adminApi('/api/payments/cash', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: $('#cashInvoice').value,
          collectedBy: $('#cashCollector').value.trim(),
          reference: $('#cashReference').value.trim()
        })
      });
      setMessage($('#cashMsg'), `Cash payment recorded. Receipt: ${result.receiptNo}.`, 'success');
      $('#cashReference').value = '';
      await loadCashInvoices();
      await refreshAdmin();
    } catch (err) {
      setMessage($('#cashMsg'), err.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#paymentTable').addEventListener('click', handlePaymentAction);
  $('#pendingTable').addEventListener('click', handlePaymentAction);
}

async function enterAdmin() {
  try {
    await refreshAdmin();
    $('#adminLogin').classList.add('hidden');
    $('#adminDashboard').classList.remove('hidden');
    $('#generateMonth').value = currentMonthInput();
  } catch (err) {
    localStorage.removeItem('hksAdminToken');
    adminState.token = '';
    $('#adminLogin').classList.remove('hidden');
    setMessage($('#adminLoginMsg'), err.message, 'error');
  }
}

async function refreshAdmin() {
  const [overview, members, invoices, pending, payments] = await Promise.all([
    adminApi('/api/admin/overview'),
    adminApi('/api/admin/members'),
    adminApi('/api/admin/invoices'),
    adminApi('/api/admin/payments?status=pending'),
    adminApi('/api/admin/payments')
  ]);
  adminState.data = { overview: overview, members: members.members, invoices: invoices.invoices, pending: pending.payments, payments: payments.payments };

  $('#statMembers').textContent = String(overview.active_members);
  $('#statPendingInvoices').textContent = String(overview.pending_invoices);
  $('#statCollectedMonth').textContent = formatMoney(overview.collected_this_month_paise);
  $('#statPendingVerification').textContent = String(overview.pending_verifications);
  $('#statTotalCollected').textContent = formatMoney(overview.total_collected_paise);

  $('#memberRows').innerHTML = adminState.data.members.length
    ? adminState.data.members.map((member) => `
        <tr>
          <td><strong>${escapeHtml(member.full_name)}</strong></td>
          <td>${escapeHtml(member.phone)}</td>
          <td>${escapeHtml(member.email || '—')}</td>
          <td>${escapeHtml(member.ward || '—')}</td>
          <td>${member.invoice_count} / ${member.paid_count}</td>
          <td>${member.is_active ? 'Active' : 'Inactive'}</td>
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

  const renderPaymentRow = (payment, withActions) => `
    <tr>
      <td>${escapeHtml(payment.invoice_no)}</td>
      <td>${escapeHtml(payment.full_name)}<br><span class="muted small">${escapeHtml(payment.phone)}</span></td>
      <td>${escapeHtml(payment.method)}</td>
      <td>${escapeHtml(payment.upi_ref || payment.razorpay_payment_id || payment.reference || '—')}</td>
      <td>${statusBadge(payment.status)}</td>
      <td>${dateLabel(payment.paid_at || payment.created_at)}</td>
      <td>
        ${payment.receipt_no
          ? `<a href="/receipt.html?id=${encodeURIComponent(payment.id)}">Receipt</a>`
          : withActions
            ? `<button class="btn btn-small btn-primary" data-verify="${escapeHtml(payment.id)}">Verify</button>
               <button class="btn btn-small btn-danger" data-reject="${escapeHtml(payment.id)}">Reject</button>`
            : '—'}
      </td>
    </tr>`;

  $('#pendingRows').innerHTML = adminState.data.pending.length
    ? adminState.data.pending.map((payment) => renderPaymentRow(payment, true)).join('')
    : '<tr><td colspan="7" class="muted center">No payments awaiting verification.</td></tr>';

  $('#paymentRows').innerHTML = adminState.data.payments.length
    ? adminState.data.payments.slice(0, 80).map((payment) => renderPaymentRow(payment, false)).join('')
    : '<tr><td colspan="7" class="muted center">No payments recorded yet.</td></tr>';
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
    const data = await api(`/api/members/lookup?phone=${encodeURIComponent(phone)}`);
    const unpaid = data.invoices.filter((invoice) => invoice.status !== 'paid');
    select.innerHTML = unpaid.length
      ? unpaid.map((invoice) => `<option value="${escapeHtml(invoice.id)}">${escapeHtml(invoice.invoice_no)} · ${monthLabel(invoice.billing_month)} · ${formatMoney(invoice.amount_paise)}</option>`).join('')
      : '<option value="">No unpaid invoices</option>';
  } catch (err) {
    select.innerHTML = `<option value="">${escapeHtml(err.message)}</option>`;
  }
}

async function handlePaymentAction(event) {
  const verifyId = event.target.closest('[data-verify]')?.dataset.verify;
  const rejectId = event.target.closest('[data-reject]')?.dataset.reject;
  if (!verifyId && !rejectId) return;

  try {
    if (verifyId) {
      await adminApi(`/api/admin/payments/${verifyId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ verifiedBy: 'admin' })
      });
    } else {
      const reason = window.prompt('Reason for rejection:', 'UTR could not be matched') || 'Manual payment could not be verified.';
      await adminApi(`/api/admin/payments/${rejectId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    }
    await refreshAdmin();
  } catch (err) {
    window.alert(err.message);
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
  } catch (err) {
    setMessage($('#receiptMsg'), err.message, 'error');
  }
  $('#printBtn').addEventListener('click', () => window.print());
}

function renderReceipt(receipt) {
  const methodLabel = {
    razorpay: 'Razorpay (online)',
    upi: 'UPI (manual verification)',
    cash: 'Cash'
  }[receipt.method] || receipt.method;

  const transaction = receipt.razorpay_payment_id || receipt.upi_ref || receipt.reference || '—';
  $('#receiptContent').innerHTML = `
    <div class="receipt-top">
      <div>
        <h1>Haritha Karma Sena</h1>
        <div class="muted">Monthly membership fee · Digital receipt</div>
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
        Verify online at ${escapeHtml(receipt.verificationUrl)}<br>
        Haritha Karma Sena · Waste management &amp; cleanliness mission
      </div>
      <img src="/api/receipts/${encodeURIComponent(receipt.id)}/qr" alt="Receipt verification QR code" />
    </div>`;
}

// ---------------------------------------------------------------------------
const initialisers = {
  home: initHome,
  pay: initPay,
  history: initHistory,
  admin: initAdmin,
  receipt: initReceipt
};

if (initialisers[page]) initialisers[page]();
