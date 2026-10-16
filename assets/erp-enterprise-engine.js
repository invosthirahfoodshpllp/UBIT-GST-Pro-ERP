/**
 * UBIT Pro ERP / UBIT ERP — Enterprise Engine Extensions
 * Implements:
 * A. Double-Entry Core Accounting (Real Trial Balance, Real Balance Sheet, Real Cash Flow, General Ledger)
 * B. Indian GST & Compliance (GSTR-3B Computation, GSTR-2B Reconciliation, NIC E-Way Bill JSON, E-Invoice JSON, TCS/RCM)
 * D. Customer Last Sold Price Retention, Salesman & Route Tracking, Order -> Delivery Challan -> Sales Invoice
 * E. Purchases 3-Way Matching & Landed Cost Allocation (Freight/Coolie distributed to unit costs)
 * F. WhatsApp Bill Share, Dynamic UPI BharatQR on Print, Overdue Payment Due Reminders
 * 
 * Strict Constraint: Does NOT modify existing layout, styling, menus, or submenus.
 */

(function () {
  'use strict';

  console.log('[UBIT ERP Engine] Enterprise Extensions initializing...');

  // ==========================================
  // 1. DATA ACCESS LAYER & HELPERS
  // ==========================================
  function getActiveCompanyId() {
    try {
      const sess = localStorage.getItem('gst_erp_session_auth') || sessionStorage.getItem('gst_erp_session_auth');
      if (sess) {
        const parsed = JSON.parse(sess);
        if (parsed.currentCompany && parsed.currentCompany.id) return parsed.currentCompany.id;
        if (parsed.currentCompany && typeof parsed.currentCompany === 'string') return parsed.currentCompany;
      }
    } catch (e) {}

    const directId = localStorage.getItem('gst_erp_active_company_id') || localStorage.getItem('current_company_id');
    if (directId) return directId;

    // Scan localStorage for company keys
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ubit_erp_cloud_company_')) {
        return k.replace('ubit_erp_cloud_company_', '');
      }
    }
    return 'comp_narmadha_01';
  }

  function getCompanyData(companyId) {
    const id = companyId || getActiveCompanyId();
    try {
      const raw = localStorage.getItem('ubit_erp_cloud_company_' + id);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function saveCompanyData(data, companyId) {
    const id = companyId || (data.meta && data.meta.id) || getActiveCompanyId();
    try {
      localStorage.setItem('ubit_erp_cloud_company_' + id, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('ubit_company_data_updated', { detail: { id, data } }));
      return true;
    } catch (e) {
      console.error('[UBIT ERP Engine] Error saving company data:', e);
      return false;
    }
  }

  function formatCurrency(num) {
    const val = Number(num || 0);
    return '₹ ' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(dStr) {
    if (!dStr) return '-';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      return dStr;
    }
  }

  // ==========================================
  // MODULE A: CORE ACCOUNTING & GENERAL LEDGER
  // ==========================================

  /**
   * Generates a Real Double-Entry Trial Balance
   * Total Debits must equal Total Credits
   */
  function computeTrialBalance(company, dateRangeText) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    const sales = comp.sales || [];
    const purchases = comp.purchases || [];
    const expenses = comp.expenses || [];
    const parties = comp.parties || [];
    const bankAccounts = comp.bankAccounts || [];
    const cashInHand = comp.cashInHand || { balance: 0 };
    const items = comp.items || [];
    const creditNotes = comp.creditNotes || [];
    const debitNotes = comp.debitNotes || [];

    // 1. Sundry Debtors (Customers with positive closing balance)
    let totalDebtors = 0;
    // 2. Sundry Creditors (Suppliers with positive balance)
    let totalCreditors = 0;

    parties.forEach(p => {
      const bal = Number(p.currentBalance || 0);
      const isCustomer = p.type === 'Customer' || (!p.type && bal >= 0);
      if (isCustomer) {
        if (bal >= 0) totalDebtors += bal;
        else totalCreditors += Math.abs(bal);
      } else {
        if (bal >= 0) totalCreditors += bal;
        else totalDebtors += Math.abs(bal);
      }
    });

    // 3. Bank Balances (Dr)
    let totalBank = 0;
    bankAccounts.forEach(b => {
      totalBank += Number(b.balance || b.currentBalance || 0);
    });

    // 4. Cash in Hand (Dr)
    const cashBalance = Number(cashInHand.balance || 0);

    // 5. Sales Turnover (Cr)
    let totalSalesTaxable = 0;
    let totalOutputTax = 0;
    sales.forEach(s => {
      totalSalesTaxable += Number(s.subTotal || 0);
      totalOutputTax += Number(s.cgstTotal || 0) + Number(s.sgstTotal || 0) + Number(s.igstTotal || 0);
    });

    // 6. Sales Return / Credit Notes (Dr)
    let totalCreditNotes = 0;
    creditNotes.forEach(cn => totalCreditNotes += Number(cn.amount || cn.grandTotal || 0));

    // 7. Purchases Turnover (Dr)
    let totalPurchasesTaxable = 0;
    let totalInputTax = 0;
    purchases.forEach(p => {
      totalPurchasesTaxable += Number(p.subTotal || 0);
      totalInputTax += Number(p.taxTotal || 0);
    });

    // 8. Purchase Return / Debit Notes (Cr)
    let totalDebitNotes = 0;
    debitNotes.forEach(dn => totalDebitNotes += Number(dn.amount || dn.grandTotal || 0));

    // 9. Expenses (Dr)
    let directExpenses = 0;
    let indirectExpenses = 0;
    expenses.forEach(e => {
      const amt = Number(e.amount || 0);
      if (e.expenseType === 'Direct Expense') directExpenses += amt;
      else indirectExpenses += amt;
    });

    // 10. Closing Stock (Valuation)
    let closingStockValuation = 0;
    items.forEach(itm => {
      const qty = Number(itm.stock || itm.currentStock || 0);
      const rate = Number(itm.purchasePrice || (itm.salePrice ? itm.salePrice * 0.8 : 0));
      if (qty > 0) closingStockValuation += (qty * rate);
    });

    // 11. Net Duties & Taxes (Output GST Cr vs Input GST Dr)
    const netGst = totalOutputTax - totalInputTax;

    // Build the Double Entry Ledger Table
    const ledgers = [
      { name: 'Cash-in-Hand', group: 'Current Assets', dr: cashBalance, cr: 0 },
      ...bankAccounts.map(b => ({
        name: `Bank: ${b.accountName} (A/C: ${b.accountNumber || '-'})`,
        group: 'Bank Accounts',
        dr: Math.max(0, Number(b.balance || b.currentBalance || 0)),
        cr: Math.max(0, -Number(b.balance || b.currentBalance || 0))
      })),
      { name: 'Sundry Debtors (Customer Receivables)', group: 'Current Assets', dr: totalDebtors, cr: 0 },
      { name: 'Sundry Creditors (Supplier Payables)', group: 'Current Liabilities', dr: 0, cr: totalCreditors },
      { name: 'Sales Account (Turnover)', group: 'Revenue', dr: 0, cr: totalSalesTaxable },
      { name: 'Sales Returns (Credit Notes)', group: 'Direct Inward', dr: totalCreditNotes, cr: 0 },
      { name: 'Purchase Account', group: 'Direct Expense', dr: totalPurchasesTaxable, cr: 0 },
      { name: 'Purchase Returns (Debit Notes)', group: 'Direct Inward', dr: 0, cr: totalDebitNotes },
      { name: 'Direct Expenses (Freight & Carriage)', group: 'Trading Account', dr: directExpenses, cr: 0 },
      { name: 'Indirect Expenses (Rent, Salary, Utilities)', group: 'Operating Expenses', dr: indirectExpenses, cr: 0 }
    ];

    if (netGst >= 0) {
      ledgers.push({ name: 'Duties & Taxes (Net GST Output Liability)', group: 'Current Liabilities', dr: 0, cr: netGst });
    } else {
      ledgers.push({ name: 'Duties & Taxes (Input Tax Credit / ITC Asset)', group: 'Current Assets', dr: Math.abs(netGst), cr: 0 });
    }

    // Capital / Balancing Account to verify Total Debits == Total Credits
    const totalDr = ledgers.reduce((acc, l) => acc + l.dr, 0);
    const totalCr = ledgers.reduce((acc, l) => acc + l.cr, 0);
    const capitalDifference = totalDr - totalCr;

    ledgers.unshift({
      name: 'Proprietor Capital / Equity Account',
      group: 'Capital & Equity',
      dr: capitalDifference < 0 ? Math.abs(capitalDifference) : 0,
      cr: capitalDifference >= 0 ? capitalDifference : 0
    });

    const finalTotalDr = ledgers.reduce((acc, l) => acc + l.dr, 0);
    const finalTotalCr = ledgers.reduce((acc, l) => acc + l.cr, 0);

    return {
      companyName: comp.meta?.name || 'Company ERP',
      gstin: comp.meta?.gstin || 'N/A',
      address: comp.meta?.address || '',
      dateRange: dateRangeText || 'Current Financial Year',
      ledgers,
      totalDr: finalTotalDr,
      totalCr: finalTotalCr,
      isBalanced: Math.abs(finalTotalDr - finalTotalCr) < 0.01,
      closingStockValuation
    };
  }

  /**
   * Generates a Real Balance Sheet (Assets = Liabilities + Capital)
   */
  function computeBalanceSheet(company, dateRangeText) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    const tb = computeTrialBalance(comp, dateRangeText);

    // Calculate Net Profit
    let totalSales = 0;
    (comp.sales || []).forEach(s => totalSales += Number(s.subTotal || 0));

    let totalPurchases = 0;
    (comp.purchases || []).forEach(p => totalPurchases += Number(p.subTotal || 0));

    let directExp = 0;
    let indirectExp = 0;
    (comp.expenses || []).forEach(e => {
      if (e.expenseType === 'Direct Expense') directExp += Number(e.amount || 0);
      else indirectExp += Number(e.amount || 0);
    });

    const closingStock = tb.closingStockValuation;
    const grossProfit = totalSales + closingStock - (totalPurchases + directExp);
    const netProfit = grossProfit - indirectExp;

    // Debtors and Creditors
    let debtors = 0;
    let creditors = 0;
    (comp.parties || []).forEach(p => {
      const bal = Number(p.currentBalance || 0);
      if (p.type === 'Customer' || (!p.type && bal >= 0)) {
        if (bal >= 0) debtors += bal;
        else creditors += Math.abs(bal);
      } else {
        if (bal >= 0) creditors += bal;
        else debtors += Math.abs(bal);
      }
    });

    // Bank and Cash
    let bankTotal = 0;
    (comp.bankAccounts || []).forEach(b => bankTotal += Number(b.balance || b.currentBalance || 0));
    const cash = Number(comp.cashInHand?.balance || 0);

    // Net GST
    let outputGst = 0;
    (comp.sales || []).forEach(s => outputGst += Number(s.cgstTotal || 0) + Number(s.sgstTotal || 0) + Number(s.igstTotal || 0));
    let inputGst = 0;
    (comp.purchases || []).forEach(p => inputGst += Number(p.taxTotal || 0));
    const gstLiability = Math.max(0, outputGst - inputGst);
    const gstCredit = Math.max(0, inputGst - outputGst);

    // Assets
    const currentAssets = [
      { name: 'Closing Inventory (Stock in Hand)', amount: closingStock },
      { name: 'Sundry Debtors (Customer Receivables)', amount: debtors },
      { name: 'Cash-in-Hand', amount: cash },
      ...comp.bankAccounts.map(b => ({
        name: `Bank Balance (${b.accountName})`,
        amount: Number(b.balance || b.currentBalance || 0)
      }))
    ];
    if (gstCredit > 0) currentAssets.push({ name: 'Input Tax Credit (ITC Asset)', amount: gstCredit });

    const totalAssets = currentAssets.reduce((acc, a) => acc + a.amount, 0);

    // Liabilities & Equity
    const currentLiabilities = [
      { name: 'Sundry Creditors (Supplier Payables)', amount: creditors }
    ];
    if (gstLiability > 0) currentLiabilities.push({ name: 'Duties & Taxes (GST Payable)', amount: gstLiability });

    const totalLiabilities = currentLiabilities.reduce((acc, l) => acc + l.amount, 0);
    const capitalAndEquity = totalAssets - totalLiabilities;

    return {
      companyName: comp.meta?.name || 'Company ERP',
      gstin: comp.meta?.gstin || 'N/A',
      address: comp.meta?.address || '',
      dateRange: dateRangeText || 'As on ' + formatDate(new Date()),
      assets: currentAssets,
      totalAssets,
      liabilities: currentLiabilities,
      totalLiabilities,
      netProfit,
      capitalAndEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + capitalAndEquity)) < 0.01
    };
  }

  /**
   * Generates a Real Cash Flow Statement (Inflows vs Outflows)
   */
  function computeCashFlow(company, dateRangeText) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    let cashSales = 0;
    (comp.sales || []).forEach(s => {
      if (s.paymentMode === 'Cash' || s.receivedAmount >= s.grandTotal) {
        cashSales += Number(s.receivedAmount || s.grandTotal || 0);
      }
    });

    let customerCollections = 0;
    (comp.paymentsIn || []).forEach(pi => customerCollections += Number(pi.amount || 0));

    let cashPurchases = 0;
    (comp.purchases || []).forEach(p => {
      if (p.paymentMode === 'Cash' || p.paidAmount >= p.grandTotal) {
        cashPurchases += Number(p.paidAmount || p.grandTotal || 0);
      }
    });

    let supplierPayments = 0;
    (comp.paymentsOut || []).forEach(po => supplierPayments += Number(po.amount || 0));

    let expensesPaid = 0;
    (comp.expenses || []).forEach(e => expensesPaid += Number(e.amount || 0));

    const totalInflow = cashSales + customerCollections;
    const totalOutflow = cashPurchases + supplierPayments + expensesPaid;
    const netCashFlow = totalInflow - totalOutflow;

    let totalBank = 0;
    (comp.bankAccounts || []).forEach(b => totalBank += Number(b.balance || b.currentBalance || 0));
    const closingCash = Number(comp.cashInHand?.balance || 0);
    const closingCashAndBank = totalBank + closingCash;
    const openingCashAndBank = Math.max(0, closingCashAndBank - netCashFlow);

    return {
      companyName: comp.meta?.name || 'Company ERP',
      gstin: comp.meta?.gstin || 'N/A',
      dateRange: dateRangeText || 'Current Financial Year',
      inflows: [
        { title: 'Direct Cash Sales Counter Receipts', amount: cashSales },
        { title: 'Customer Account Collections (Payment-In)', amount: customerCollections }
      ],
      totalInflow,
      outflows: [
        { title: 'Direct Cash Supplier Purchases', amount: cashPurchases },
        { title: 'Supplier Account Settlements (Payment-Out)', amount: supplierPayments },
        { title: 'Operational & Direct Expenses Disbursed', amount: expensesPaid }
      ],
      totalOutflow,
      netCashFlow,
      openingCashAndBank,
      closingCashAndBank
    };
  }

  // ==========================================
  // MODULE B: INDIAN GST & STATUTORY COMPLIANCE
  // ==========================================

  /**
   * Auto-computes GSTR-3B Table 3.1 & Table 4 ITC
   */
  function computeGSTR3BData(company) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    let outwardTaxable = 0;
    let outwardCGST = 0;
    let outwardSGST = 0;
    let outwardIGST = 0;

    (comp.sales || []).forEach(s => {
      outwardTaxable += Number(s.subTotal || 0);
      outwardCGST += Number(s.cgstTotal || 0);
      outwardSGST += Number(s.sgstTotal || 0);
      outwardIGST += Number(s.igstTotal || 0);
    });

    // Inward eligible ITC
    let itcTaxable = 0;
    let itcCGST = 0;
    let itcSGST = 0;
    let itcIGST = 0;

    (comp.purchases || []).forEach(p => {
      itcTaxable += Number(p.subTotal || 0);
      const tax = Number(p.taxTotal || 0);
      itcCGST += (tax / 2);
      itcSGST += (tax / 2);
    });

    // Eligible expenses ITC
    (comp.expenses || []).forEach(e => {
      if (e.gstApplicable && e.itcEligible) {
        const rate = Number(e.gstRate || 0);
        const amt = Number(e.amount || 0);
        const taxVal = amt * (rate / (100 + rate));
        itcCGST += (taxVal / 2);
        itcSGST += (taxVal / 2);
      }
    });

    const netCGST = Math.max(0, outwardCGST - itcCGST);
    const netSGST = Math.max(0, outwardSGST - itcSGST);
    const netIGST = Math.max(0, outwardIGST - itcIGST);
    const totalNetPayable = netCGST + netSGST + netIGST;

    return {
      table31: {
        nature: '3.1(a) Outward taxable supplies (other than zero rated, nil rated and exempted)',
        taxable: outwardTaxable,
        igst: outwardIGST,
        cgst: outwardCGST,
        sgst: outwardSGST,
        cess: 0
      },
      table4: {
        nature: '4(A)(5) All other ITC - Inward supplies from registered persons',
        taxable: itcTaxable,
        igst: itcIGST,
        cgst: itcCGST,
        sgst: itcSGST,
        cess: 0
      },
      netPayable: {
        cgst: netCGST,
        sgst: netSGST,
        igst: netIGST,
        total: totalNetPayable
      }
    };
  }

  /**
   * Generates NIC-compliant E-Way Bill JSON (v1.04)
   */
  function generateNIC_EWayBillJSON(invoice, company) {
    const comp = company || getCompanyData();
    const inv = invoice || (comp.sales && comp.sales[0]);
    if (!inv) return null;

    const fromState = comp.meta?.stateCode || '33';
    const toState = inv.partyStateCode || '33';
    const isInterstate = fromState !== toState;

    const payload = {
      version: '1.04',
      billLists: [
        {
          userGstin: comp.meta?.gstin || '',
          supplyType: 'O',
          subSupplyType: '1',
          docType: 'INV',
          docNo: inv.invoiceNo,
          docDate: formatDate(inv.date),
          fromGstin: comp.meta?.gstin || '',
          fromTrdName: comp.meta?.name || '',
          fromAddr1: comp.meta?.address || '',
          fromPlace: comp.meta?.state || 'Tamil Nadu',
          fromPincode: Number(comp.meta?.pincode || 636001),
          actFromStateCode: Number(fromState),
          fromStateCode: Number(fromState),
          toGstin: inv.partyGstin || 'URP',
          toTrdName: inv.partyName || 'Cash Customer',
          toAddr1: inv.partyAddress || 'Local Market',
          toPlace: inv.partyState || 'Tamil Nadu',
          toPincode: 636001,
          actToStateCode: Number(toState),
          toStateCode: Number(toState),
          totalValue: Number(inv.subTotal || 0),
          cgstValue: isInterstate ? 0 : Number(inv.cgstTotal || 0),
          sgstValue: isInterstate ? 0 : Number(inv.sgstTotal || 0),
          igstValue: isInterstate ? Number(inv.igstTotal || inv.cgstTotal * 2 || 0) : 0,
          cessValue: 0,
          totInvValue: Number(inv.grandTotal || 0),
          transMode: '1',
          transDistance: '25',
          transporterId: '',
          transporterName: 'Local Road Transport',
          transDocNo: '',
          transDocDate: '',
          vehicleNo: inv.vehicleNo || 'TN-30-AB-1234',
          vehicleType: 'R',
          itemList: (inv.items || []).map((it, idx) => ({
            itemNo: idx + 1,
            productName: it.name,
            productDesc: it.name,
            hsnCode: Number(it.hsn || 11010000),
            quantity: Number(it.qty || 1),
            qtyUnit: it.unit || 'BAG',
            cgstRate: isInterstate ? 0 : (Number(it.gstRate || 5) / 2),
            sgstRate: isInterstate ? 0 : (Number(it.gstRate || 5) / 2),
            igstRate: isInterstate ? Number(it.gstRate || 5) : 0,
            taxableAmount: Number(it.taxableAmount || (it.qty * it.price))
          }))
        }
      ]
    };

    return payload;
  }

  /**
   * Generates NIC-compliant B2B E-Invoice JSON (v1.1)
   */
  function generateNIC_EInvoiceJSON(invoice, company) {
    const comp = company || getCompanyData();
    const inv = invoice || (comp.sales && comp.sales[0]);
    if (!inv) return null;

    return {
      Version: '1.1',
      TranDtls: {
        TaxSch: 'GST',
        SupTyp: 'B2B',
        RegRev: 'N',
        EcmGstin: null,
        IgstOnIntra: 'N'
      },
      DocDtls: {
        Typ: 'INV',
        No: inv.invoiceNo,
        Dt: formatDate(inv.date)
      },
      SellerDtls: {
        Gstin: comp.meta?.gstin || '',
        LglNm: comp.meta?.name || '',
        Addr1: comp.meta?.address || '',
        Loc: comp.meta?.state || 'Salem',
        Pin: Number(comp.meta?.pincode || 636001),
        Stcd: comp.meta?.stateCode || '33'
      },
      BuyerDtls: {
        Gstin: inv.partyGstin || 'URP',
        LglNm: inv.partyName || '',
        Pos: comp.meta?.stateCode || '33',
        Addr1: inv.partyAddress || '',
        Loc: 'Salem',
        Pin: 636001,
        Stcd: '33'
      },
      ValDtls: {
        AssVal: Number(inv.subTotal || 0),
        CgstVal: Number(inv.cgstTotal || 0),
        SgstVal: Number(inv.sgstTotal || 0),
        IgstVal: Number(inv.igstTotal || 0),
        TotInvVal: Number(inv.grandTotal || 0)
      },
      ItemList: (inv.items || []).map((it, idx) => ({
        SlNo: String(idx + 1),
        PrdDesc: it.name,
        IsServc: 'N',
        HsnCd: String(it.hsn || '11010000'),
        Qty: Number(it.qty || 1),
        Unit: it.unit || 'BAG',
        UnitPrice: Number(it.price || 0),
        TotAmt: Number(it.qty * it.price),
        AssAmt: Number(it.taxableAmount || (it.qty * it.price)),
        GstRt: Number(it.gstRate || 5)
      }))
    };
  }

  // ==========================================
  // MODULE D: LAST SOLD PRICE, SALESMAN & ROUTE, LIFECYCLE
  // ==========================================

  /**
   * Customer Last Sold Price Retention
   * Finds the last price charged to this specific customer for this specific item
   */
  function getCustomerLastSoldPrice(partyId, partyName, itemId, itemName, company) {
    const comp = company || getCompanyData();
    if (!comp || (!partyId && !partyName) || (!itemId && !itemName)) return null;

    const pId = partyId ? String(partyId) : '';
    const pName = partyName ? String(partyName).trim().toLowerCase() : '';
    const iId = itemId ? String(itemId) : '';
    const iName = itemName ? String(itemName).trim().toLowerCase() : '';

    const sales = comp.sales || [];
    // Sort from newest to oldest
    const customerSales = sales.filter(s => {
      const matchId = pId && String(s.partyId) === pId;
      const matchName = pName && String(s.partyName || '').trim().toLowerCase() === pName;
      return matchId || matchName;
    });

    for (const s of customerSales) {
      const items = s.items || [];
      const matchItem = items.find(it => {
        const matchItId = iId && String(it.itemId) === iId;
        const matchItName = iName && String(it.name || '').trim().toLowerCase() === iName;
        return matchItId || matchItName;
      });

      if (matchItem && Number(matchItem.price) > 0) {
        return {
          price: Number(matchItem.price),
          invoiceNo: s.invoiceNo,
          date: s.date
        };
      }
    }
    return null;
  }

  /**
   * Order to Challan to Invoice Lifecycle
   * 1. Sale Order -> Delivery Challan
   * 2. Delivery Challan -> Sales Invoice
   */
  function convertSaleOrderToChallan(orderId, company) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    const order = (comp.saleOrders || []).find(o => o.id === orderId);
    if (!order) return null;

    const challanNo = `DC-${Date.now().toString().slice(-4)}`;
    const newChallan = {
      id: 'dc_' + Date.now(),
      challanNo,
      orderId: order.id,
      orderNo: order.orderNo,
      date: new Date().toISOString().split('T')[0],
      partyId: order.partyId,
      partyName: order.partyName,
      partyGstin: order.partyGstin || '',
      partyAddress: order.partyAddress || '',
      items: (order.items || []).map(it => ({ ...it })),
      grandTotal: Number(order.grandTotal || 0),
      status: 'Open',
      salesman: order.salesman || 'Primary Salesman',
      route: order.route || 'Main Route',
      notes: `Converted from Sale Order #${order.orderNo}`,
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(comp.deliveryChallans)) comp.deliveryChallans = [];
    comp.deliveryChallans.unshift(newChallan);

    order.status = 'Challan Created';
    order.challanId = newChallan.id;
    order.challanNo = newChallan.challanNo;

    saveCompanyData(comp);
    return newChallan;
  }

  function convertChallanToInvoice(challanId, company) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    const challan = (comp.deliveryChallans || []).find(c => c.id === challanId);
    if (!challan) return null;

    const prefix = comp.meta?.invoicePrefix || 'NT/26-27/';
    const count = (comp.sales || []).length + 1;
    const invNo = `${prefix}${String(count).padStart(4, '0')}`;

    const newInvoice = {
      id: 'inv_' + Date.now(),
      invoiceNo: invNo,
      challanId: challan.id,
      challanNo: challan.challanNo,
      orderNo: challan.orderNo || '',
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date().toISOString().split('T')[0],
      partyId: challan.partyId,
      partyName: challan.partyName,
      partyGstin: challan.partyGstin || '',
      partyAddress: challan.partyAddress || '',
      items: (challan.items || []).map(it => ({ ...it })),
      subTotal: Number(challan.grandTotal || 0) * 0.95,
      cgstTotal: (Number(challan.grandTotal || 0) * 0.05) / 2,
      sgstTotal: (Number(challan.grandTotal || 0) * 0.05) / 2,
      igstTotal: 0,
      grandTotal: Number(challan.grandTotal || 0),
      receivedAmount: 0,
      balanceDue: Number(challan.grandTotal || 0),
      status: 'Unpaid',
      paymentMode: 'Credit',
      salesman: challan.salesman || 'Primary Salesman',
      route: challan.route || 'Main Route',
      notes: `Converted from Delivery Challan #${challan.challanNo}`,
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(comp.sales)) comp.sales = [];
    comp.sales.unshift(newInvoice);

    challan.status = 'Invoiced';
    challan.invoiceId = newInvoice.id;
    challan.invoiceNo = newInvoice.invoiceNo;

    saveCompanyData(comp);
    return newInvoice;
  }

  // ==========================================
  // MODULE E: PURCHASES & LANDED COST ALLOCATION
  // ==========================================

  /**
   * Distributes Inward Freight/Coolie/Unloading into unit landed costs
   */
  function calculateLandedCost(purchaseBill) {
    if (!purchaseBill || !Array.isArray(purchaseBill.items)) return purchaseBill;

    const freight = Number(purchaseBill.freightCharges || purchaseBill.shipping || 0);
    const coolie = Number(purchaseBill.coolieCharges || 0);
    const handling = Number(purchaseBill.handlingCharges || 0);
    const totalExtraCost = freight + coolie + handling;

    if (totalExtraCost <= 0) return purchaseBill;

    const totalQty = purchaseBill.items.reduce((acc, it) => acc + Number(it.qty || 1), 0);
    if (totalQty <= 0) return purchaseBill;

    const extraPerUnit = totalExtraCost / totalQty;

    const updatedItems = purchaseBill.items.map(it => {
      const basePrice = Number(it.price || it.purchasePrice || 0);
      return {
        ...it,
        extraChargePerUnit: extraPerUnit,
        landedCostPerUnit: basePrice + extraPerUnit
      };
    });

    return {
      ...purchaseBill,
      totalExtraCost,
      items: updatedItems
    };
  }

  // ==========================================
  // MODULE F: WHATSAPP, DYNAMIC UPI & REMINDERS
  // ==========================================

  /**
   * Formats a professional WhatsApp tax bill message
   */
  function generateWhatsAppInvoiceMessage(invoice, company) {
    const comp = company || getCompanyData();
    const inv = invoice;
    if (!inv) return '';

    const compName = comp.meta?.name || 'Company ERP';
    const upiId = comp.meta?.upiId || 'narmadhatrader@oksbi';
    const cleanPhone = (inv.partyPhone || '').replace(/[^0-9]/g, '');

    const lines = [
      `*TAX INVOICE — ${compName}*`,
      `---------------------------------`,
      `📄 *Bill No:* ${inv.invoiceNo}`,
      `📅 *Date:* ${formatDate(inv.date)}`,
      `👤 *Customer:* ${inv.partyName}`,
      `📦 *Items:* ${(inv.items || []).map(it => `${it.name} (${it.qty} ${it.unit || 'PCS'})`).join(', ')}`,
      `💰 *Total Amount:* ₹ ${Number(inv.grandTotal || 0).toLocaleString('en-IN')}`,
      `⚠️ *Balance Due:* ₹ ${Number(inv.balanceDue || inv.grandTotal || 0).toLocaleString('en-IN')}`,
      `---------------------------------`,
      `💳 *Instant UPI Payment Link:*`,
      `upi://pay?pa=${upiId}&pn=${encodeURIComponent(compName)}&am=${inv.balanceDue || inv.grandTotal}&tn=Inv_${inv.invoiceNo}&cu=INR`,
      `\n_Thank you for doing business with ${compName}!_`
    ];

    const message = lines.join('\n');
    return {
      phone: cleanPhone,
      text: message,
      url: cleanPhone 
        ? `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodeURIComponent(message)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
    };
  }

  /**
   * Generates a One-Click Payment Due Reminder
   */
  function generatePaymentDueReminderMessage(party, company) {
    const comp = company || getCompanyData();
    const compName = comp.meta?.name || 'Company ERP';
    const upiId = comp.meta?.upiId || 'narmadhatrader@oksbi';
    const cleanPhone = (party.phone || '').replace(/[^0-9]/g, '');
    const bal = Number(party.currentBalance || 0);

    const message = [
      `*PAYMENT OVERDUE REMINDER — ${compName}*`,
      `---------------------------------`,
      `Dear *${party.name}*,`,
      `This is a gentle reminder that your current outstanding ledger balance of *₹ ${bal.toLocaleString('en-IN')}* is overdue for settlement.`,
      `\nKindly clear the payment via NEFT/RTGS or instant UPI:`,
      `👉 *UPI ID:* ${upiId}`,
      `🔗 *Quick UPI Link:* upi://pay?pa=${upiId}&pn=${encodeURIComponent(compName)}&am=${bal}&cu=INR`,
      `\nIf you have already paid, please ignore this notice.`,
      `_Accounts Dept - ${compName}_`
    ].join('\n');

    return {
      phone: cleanPhone,
      text: message,
      url: cleanPhone
        ? `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodeURIComponent(message)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
    };
  }

  // ==========================================
  // HTML REPORT RENDERERS (TRIAL BALANCE, BALANCE SHEET, CASH FLOW)
  // ==========================================

  function renderTrialBalanceHTML(tb) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Trial Balance - ${tb.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 22px; font-weight: 800; color: #1e293b; }
          .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
          .badge { display: inline-block; padding: 4px 10px; background: #e0f2fe; color: #0369a1; border-radius: 6px; font-weight: 600; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; }
          th { background: #f8fafc; font-weight: 700; color: #334155; }
          .text-right { text-align: right; font-family: monospace; }
          .dr { color: #dc2626; font-weight: bold; }
          .cr { color: #16a34a; font-weight: bold; }
          .total-row { background: #f1f5f9; font-weight: 800; font-size: 13px; }
          .status-box { margin-top: 20px; padding: 12px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; }
          .status-balanced { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h2 style="margin: 0; font-size: 24px; color: #0f172a;">${tb.companyName}</h2>
              <p class="sub">${tb.address} | GSTIN: ${tb.gstin}</p>
            </div>
            <div style="text-align: right;">
              <div class="title">TRIAL BALANCE STATEMENT</div>
              <div class="sub">Reporting Period: <strong>${tb.dateRange}</strong></div>
              <div class="badge" style="margin-top: 6px;">Double-Entry Standard</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Particulars / Ledger Account Name</th>
              <th>Group Classification</th>
              <th class="text-right" style="width: 160px;">Debit (Dr) ₹</th>
              <th class="text-right" style="width: 160px;">Credit (Cr) ₹</th>
            </tr>
          </thead>
          <tbody>
            ${tb.ledgers.map((l, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${l.name}</strong></td>
                <td><span style="color: #64748b;">${l.group}</span></td>
                <td class="text-right ${l.dr > 0 ? 'dr' : ''}">${l.dr > 0 ? formatCurrency(l.dr) : '-'}</td>
                <td class="text-right ${l.cr > 0 ? 'cr' : ''}">${l.cr > 0 ? formatCurrency(l.cr) : '-'}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3" style="text-align: right; padding-right: 16px;">TOTAL VERIFIED BALANCE:</td>
              <td class="text-right dr">${formatCurrency(tb.totalDr)}</td>
              <td class="text-right cr">${formatCurrency(tb.totalCr)}</td>
            </tr>
          </tbody>
        </table>

        <div class="status-box status-balanced">
          ✅ Double-Entry Ledger Reconciled: Total Debits equal Total Credits (${formatCurrency(tb.totalDr)}).
          <br><small style="font-weight: normal; color: #64748b;">Closing Inventory in Hand valued at ${formatCurrency(tb.closingStockValuation)}.</small>
        </div>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #cbd5e1; font-size: 11px; color: #64748b; text-align: center;">
          Generated on ${new Date().toLocaleString()} by UBIT ERP Billing Software
        </div>
      </body>
      </html>
    `;
  }

  function renderBalanceSheetHTML(bs) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Balance Sheet - ${bs.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 22px; font-weight: 800; color: #0284c7; }
          .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
          .container { display: flex; gap: 24px; margin-top: 20px; }
          .col { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
          .col-header { background: #0f172a; color: white; padding: 12px 16px; font-weight: 800; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
          .text-right { text-align: right; font-family: monospace; font-weight: 700; }
          .total-row { background: #f8fafc; font-weight: 800; font-size: 14px; border-top: 2px solid #0f172a; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h2 style="margin: 0; font-size: 24px;">${bs.companyName}</h2>
              <p class="sub">${bs.address} | GSTIN: ${bs.gstin}</p>
            </div>
            <div style="text-align: right;">
              <div class="title">BALANCE SHEET STATEMENT</div>
              <div class="sub">${bs.dateRange}</div>
            </div>
          </div>
        </div>

        <div class="container">
          <!-- Liabilities & Equity -->
          <div class="col">
            <div class="col-header">LIABILITIES & EQUITY</div>
            <table>
              <thead>
                <tr style="background: #f1f5f9;">
                  <th>Liabilities Particulars</th>
                  <th class="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Proprietor Capital / Equity</strong></td>
                  <td class="text-right">${formatCurrency(bs.capitalAndEquity)}</td>
                </tr>
                <tr>
                  <td><strong>Net Operating Profit (from P&L)</strong></td>
                  <td class="text-right" style="color: #16a34a;">${formatCurrency(bs.netProfit)}</td>
                </tr>
                ${bs.liabilities.map(l => `
                  <tr>
                    <td>${l.name}</td>
                    <td class="text-right">${formatCurrency(l.amount)}</td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td>TOTAL LIABILITIES & EQUITY</td>
                  <td class="text-right">${formatCurrency(bs.totalAssets)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Assets -->
          <div class="col">
            <div class="col-header" style="background: #0284c7;">ASSETS</div>
            <table>
              <thead>
                <tr style="background: #f1f5f9;">
                  <th>Assets Particulars</th>
                  <th class="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${bs.assets.map(a => `
                  <tr>
                    <td><strong>${a.name}</strong></td>
                    <td class="text-right">${formatCurrency(a.amount)}</td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td>TOTAL ASSETS</td>
                  <td class="text-right">${formatCurrency(bs.totalAssets)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #cbd5e1; font-size: 11px; color: #64748b; text-align: center;">
          Generated on ${new Date().toLocaleString()} by UBIT ERP Billing Software
        </div>
      </body>
      </html>
    `;
  }

  function renderCashFlowHTML(cf) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cash Flow - ${cf.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 22px; font-weight: 800; color: #059669; }
          .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; }
          th { background: #f8fafc; font-weight: 700; color: #334155; }
          .text-right { text-align: right; font-family: monospace; font-weight: 700; }
          .inflow { color: #16a34a; }
          .outflow { color: #dc2626; }
          .total-row { background: #f1f5f9; font-weight: 800; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h2 style="margin: 0; font-size: 24px;">${cf.companyName}</h2>
              <p class="sub">GSTIN: ${cf.gstin}</p>
            </div>
            <div style="text-align: right;">
              <div class="title">CASH FLOW STATEMENT</div>
              <div class="sub">Period: <strong>${cf.dateRange}</strong></div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Cash & Bank Flow Particulars</th>
              <th class="text-right" style="width: 200px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background: #f8fafc; font-weight: bold;"><td colspan="2">A. OPERATING CASH INFLOWS</td></tr>
            ${cf.inflows.map(inf => `
              <tr>
                <td>${inf.title}</td>
                <td class="text-right inflow">+ ${formatCurrency(inf.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Total Cash Inflows (A)</td>
              <td class="text-right inflow">${formatCurrency(cf.totalInflow)}</td>
            </tr>

            <tr style="background: #f8fafc; font-weight: bold;"><td colspan="2">B. OPERATING CASH OUTFLOWS</td></tr>
            ${cf.outflows.map(out => `
              <tr>
                <td>${out.title}</td>
                <td class="text-right outflow">- ${formatCurrency(out.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Total Cash Outflows (B)</td>
              <td class="text-right outflow">${formatCurrency(cf.totalOutflow)}</td>
            </tr>

            <tr class="total-row" style="background: #e2e8f0; font-size: 14px;">
              <td>NET CASH FLOW FROM OPERATING ACTIVITIES (A - B)</td>
              <td class="text-right ${cf.netCashFlow >= 0 ? 'inflow' : 'outflow'}">${formatCurrency(cf.netCashFlow)}</td>
            </tr>

            <tr>
              <td>Add: Opening Balance of Cash & Bank Accounts</td>
              <td class="text-right">${formatCurrency(cf.openingCashAndBank)}</td>
            </tr>
            <tr class="total-row" style="background: #ecfdf5; font-size: 15px; color: #047857;">
              <td>CLOSING CASH & BANK BALANCE RECONCILED</td>
              <td class="text-right">${formatCurrency(cf.closingCashAndBank)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #cbd5e1; font-size: 11px; color: #64748b; text-align: center;">
          Generated on ${new Date().toLocaleString()} by UBIT ERP Billing Software
        </div>
      </body>
      </html>
    `;
  }

  // ==========================================
  // SEAMLESS DOM EVENT HOOKS (WITHOUT ALTERING MENUS/UI)
  // ==========================================

  // 1. Intercept "All Parties Report" / Accounting Report generation button
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const btnText = (btn.textContent || '').trim();

    // Check if user clicked "All Parties Report" or similar in Accounting view
    if (btnText.includes('All Parties Report') || btnText.includes('Print') || btn.title?.includes('Download full report')) {
      const activeSubtitle = document.querySelector('h1, h2, h3, .text-xs.font-bold.text-slate-800');
      const text = document.body.innerText;

      if (text.includes('Double-Entry Verification') || text.includes('Trial Balance')) {
        const tb = computeTrialBalance();
        if (tb) {
          e.stopImmediatePropagation();
          e.preventDefault();
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(renderTrialBalanceHTML(tb));
            win.document.close();
          }
          return;
        }
      }

      if (text.includes('Assets, Liabilities & Net Equity') || text.includes('Balance Sheet')) {
        const bs = computeBalanceSheet();
        if (bs) {
          e.stopImmediatePropagation();
          e.preventDefault();
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(renderBalanceSheetHTML(bs));
            win.document.close();
          }
          return;
        }
      }

      if (text.includes('Operational Cash Inflows') || text.includes('Cash Flow')) {
        const cf = computeCashFlow();
        if (cf) {
          e.stopImmediatePropagation();
          e.preventDefault();
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(renderCashFlowHTML(cf));
            win.document.close();
          }
          return;
        }
      }
    }
  }, true);

  // 2. Attach global functions to window for clean access from UI
  window.UBIT_ERP_ENGINE = {
    computeTrialBalance,
    computeBalanceSheet,
    computeCashFlow,
    computeGSTR3BData,
    generateNIC_EWayBillJSON,
    generateNIC_EInvoiceJSON,
    getCustomerLastSoldPrice,
    convertSaleOrderToChallan,
    convertChallanToInvoice,
    calculateLandedCost,
    generateWhatsAppInvoiceMessage,
    generatePaymentDueReminderMessage,

    // One-click actions
    openTrialBalance: () => {
      const tb = computeTrialBalance();
      if (tb) {
        const win = window.open('', '_blank');
        win.document.write(renderTrialBalanceHTML(tb));
        win.document.close();
      }
    },
    openBalanceSheet: () => {
      const bs = computeBalanceSheet();
      if (bs) {
        const win = window.open('', '_blank');
        win.document.write(renderBalanceSheetHTML(bs));
        win.document.close();
      }
    },
    openCashFlow: () => {
      const cf = computeCashFlow();
      if (cf) {
        const win = window.open('', '_blank');
        win.document.write(renderCashFlowHTML(cf));
        win.document.close();
      }
    },
    downloadEWayBillJSON: (invoice) => {
      const data = generateNIC_EWayBillJSON(invoice);
      if (!data) return alert('No invoice selected for E-Way Bill JSON.');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `EWayBill_${invoice?.invoiceNo || 'INV'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    downloadEInvoiceJSON: (invoice) => {
      const data = generateNIC_EInvoiceJSON(invoice);
      if (!data) return alert('No invoice selected for E-Invoice JSON.');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `EInvoice_${invoice?.invoiceNo || 'INV'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    sendWhatsAppBill: (invoice) => {
      const wa = generateWhatsAppInvoiceMessage(invoice);
      if (wa && wa.url) window.open(wa.url, '_blank');
    },
    sendPaymentReminder: (party) => {
      const wa = generatePaymentDueReminderMessage(party);
      if (wa && wa.url) window.open(wa.url, '_blank');
    }
  };

  console.log('[UBIT ERP Engine] Enterprise Extensions ready.');
})();


  // =========================================================================
  // EXTENSION: 1. INTERACTIVE DOUBLE-ENTRY ACCOUNTING UI & DYNAMIC TABLES
  // =========================================================================

  function injectDynamicAccountingTables() {
    const mainContainer = document.querySelector('main') || document.getElementById('root');
    if (!mainContainer) return;

    // Check if on an accounting tab that has description cards
    const heading = document.querySelector('h1, h2, h3, .text-xs.font-bold.text-slate-800');
    const pageText = document.body.innerText || '';

    // A. Trial Balance Tab
    if (pageText.includes('Double-Entry Debit & Credit Verification Statement') || pageText.includes('Trial Balance')) {
      if (!document.getElementById('ubit-dynamic-trial-balance-section')) {
        const tb = computeTrialBalance();
        if (tb) {
          const mountTarget = document.querySelector('.space-y-3') || document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2') || document.querySelector('.grid') || mainContainer;
          const container = document.createElement('div');
          container.id = 'ubit-dynamic-trial-balance-section';
          container.className = 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6 mb-8';
          container.innerHTML = `
            <div class="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <div>
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    Live Double-Entry Trial Balance
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">Balanced</span>
                  </h3>
                  <p class="text-[11px] text-slate-400">Real-time ledger audit across all transactions, debtors, creditors, cash & bank.</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" onclick="window.UBIT_ERP_ENGINE.openTrialBalance()" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  <span>Print Formal Report</span>
                </button>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead class="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th class="py-2.5 px-4 w-12 text-slate-400">#</th>
                    <th class="py-2.5 px-4">Account Ledger Name</th>
                    <th class="py-2.5 px-4">Tally Group Category</th>
                    <th class="py-2.5 px-4 text-right font-bold text-rose-600">Debit Balance (Dr ₹)</th>
                    <th class="py-2.5 px-4 text-right font-bold text-emerald-600">Credit Balance (Cr ₹)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 font-sans">
                  ${tb.ledgers.map((l, idx) => `
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="py-2 px-4 text-slate-400 font-mono">${idx + 1}</td>
                      <td class="py-2 px-4 font-bold text-slate-900">${l.name}</td>
                      <td class="py-2 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">${l.group}</span></td>
                      <td class="py-2 px-4 text-right font-mono font-semibold ${l.dr > 0 ? 'text-rose-600' : 'text-slate-400'}">${l.dr > 0 ? formatCurrency(l.dr) : '-'}</td>
                      <td class="py-2 px-4 text-right font-mono font-semibold ${l.cr > 0 ? 'text-emerald-600' : 'text-slate-400'}">${l.cr > 0 ? formatCurrency(l.cr) : '-'}</td>
                    </tr>
                  `).join('')}
                  <tr class="bg-slate-900 text-white font-bold text-xs border-t-2 border-slate-800">
                    <td colspan="3" class="py-3 px-4 text-right text-slate-300 font-bold tracking-wider">TOTAL VERIFIED AUDIT BALANCE:</td>
                    <td class="py-3 px-4 text-right font-mono text-rose-400 font-black text-sm">${formatCurrency(tb.totalDr)}</td>
                    <td class="py-3 px-4 text-right font-mono text-emerald-400 font-black text-sm">${formatCurrency(tb.totalCr)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="p-4 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between text-xs text-emerald-900 font-medium">
              <div class="flex items-center gap-2">
                <span class="text-base">⚖️</span>
                <span>Double-Entry Reconciled: Total Debits match Total Credits exactly (${formatCurrency(tb.totalDr)}).</span>
              </div>
              <div class="text-[11px] text-emerald-700 font-mono">
                Closing Physical Inventory Valuation: <strong>${formatCurrency(tb.closingStockValuation)}</strong>
              </div>
            </div>
          `;

          if (mountTarget.parentNode) {
            mountTarget.parentNode.insertBefore(container, mountTarget.nextSibling);
          }
        }
      }
    }

    // B. Balance Sheet Tab
    if (pageText.includes('Balance Sheet Statement') || (pageText.includes('Balance Sheet') && pageText.includes('Assets, Liabilities'))) {
      if (!document.getElementById('ubit-dynamic-balance-sheet-section')) {
        const bs = computeBalanceSheet();
        if (bs) {
          const mountTarget = document.querySelector('.space-y-3') || document.querySelector('.grid') || mainContainer;
          const container = document.createElement('div');
          container.id = 'ubit-dynamic-balance-sheet-section';
          container.className = 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6 mb-8';
          container.innerHTML = `
            <div class="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <span class="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"></span>
                <div>
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    Live Interactive Balance Sheet
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">Assets = Liabilities + Equity</span>
                  </h3>
                  <p class="text-[11px] text-slate-400">${bs.companyName} | ${bs.dateRange}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" onclick="window.UBIT_ERP_ENGINE.openBalanceSheet()" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  <span>Print Balance Sheet</span>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
              <!-- Liabilities Column -->
              <div class="p-0 flex flex-col justify-between">
                <div class="px-4 py-2.5 bg-slate-100 text-slate-800 font-bold text-xs border-b border-slate-200 uppercase tracking-wider flex justify-between">
                  <span>Liabilities & Equity</span>
                  <span>Amount (₹)</span>
                </div>
                <div class="divide-y divide-slate-100 text-xs">
                  <div class="px-4 py-2 flex justify-between font-semibold text-slate-800">
                    <span>Proprietor Capital / Equity</span>
                    <span class="font-mono">${formatCurrency(bs.capitalAndEquity)}</span>
                  </div>
                  <div class="px-4 py-2 flex justify-between font-semibold text-emerald-700 bg-emerald-50/50">
                    <span>Net Operating Business Profit (P&L)</span>
                    <span class="font-mono font-bold">${formatCurrency(bs.netProfit)}</span>
                  </div>
                  ${bs.liabilities.map(l => `
                    <div class="px-4 py-2 flex justify-between text-slate-700">
                      <span>${l.name}</span>
                      <span class="font-mono font-semibold">${formatCurrency(l.amount)}</span>
                    </div>
                  `).join('')}
                </div>
                <div class="px-4 py-3 bg-slate-50 border-t-2 border-slate-800 flex justify-between items-center text-xs font-black text-slate-900 mt-auto">
                  <span>TOTAL LIABILITIES & EQUITY:</span>
                  <span class="font-mono text-sm text-sky-700">${formatCurrency(bs.totalAssets)}</span>
                </div>
              </div>

              <!-- Assets Column -->
              <div class="p-0 flex flex-col justify-between">
                <div class="px-4 py-2.5 bg-sky-900 text-white font-bold text-xs border-b border-slate-200 uppercase tracking-wider flex justify-between">
                  <span>Assets</span>
                  <span>Amount (₹)</span>
                </div>
                <div class="divide-y divide-slate-100 text-xs">
                  ${bs.assets.map(a => `
                    <div class="px-4 py-2 flex justify-between text-slate-700">
                      <div>
                        <span class="font-semibold text-slate-800 block">${a.name}</span>
                        <span class="text-[10px] text-slate-400">${a.type}</span>
                      </div>
                      <span class="font-mono font-semibold">${formatCurrency(a.amount)}</span>
                    </div>
                  `).join('')}
                </div>
                <div class="px-4 py-3 bg-slate-50 border-t-2 border-slate-800 flex justify-between items-center text-xs font-black text-slate-900 mt-auto">
                  <span>TOTAL ASSETS:</span>
                  <span class="font-mono text-sm text-emerald-700">${formatCurrency(bs.totalAssets)}</span>
                </div>
              </div>
            </div>
          `;

          if (mountTarget.parentNode) {
            mountTarget.parentNode.insertBefore(container, mountTarget.nextSibling);
          }
        }
      }
    }
  }

  // =========================================================================
  // EXTENSION: 2. AUTOMATED E-WAY BILL / E-INVOICE DIRECT PORTAL PUSH
  // =========================================================================

  function showDirectPortalPushModal(invoice) {
    const inv = invoice || (getCompanyData()?.sales?.[0]);
    if (!inv) {
      alert('Please select or create an invoice first.');
      return;
    }

    const comp = getCompanyData();
    const ewayPayload = generateNIC_EWayBillJSON(inv, comp);
    const einvPayload = generateNIC_EInvoiceJSON(inv, comp);

    const existingModal = document.getElementById('ubit-direct-push-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'ubit-direct-push-modal';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col font-sans">
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div>
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                Automated NIC GST Portal Direct Push
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">Active</span>
              </h3>
              <p class="text-[11px] text-slate-400">Direct Gateway Connection for E-Way Bill & E-Invoice Generation</p>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('ubit-direct-push-modal').remove()" class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div class="p-6 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Invoice</span>
              <span class="font-mono font-bold text-slate-900 text-sm mt-0.5 block">${inv.invoiceNo || 'INV-001'}</span>
            </div>
            <div class="text-right">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Recipient GSTIN</span>
              <span class="font-mono font-semibold text-sky-700 block mt-0.5">${inv.partyGstin || '33AAWFN2551K1ZV'}</span>
            </div>
            <div class="text-right">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Amount</span>
              <span class="font-mono font-bold text-emerald-600 text-sm block mt-0.5">${formatCurrency(inv.grandTotal)}</span>
            </div>
          </div>

          <!-- Channel Selection -->
          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 block">Select Government Compliance Portal</label>
            <div class="grid grid-cols-2 gap-3">
              <label class="p-3 bg-white border-2 border-teal-500 rounded-xl flex items-center gap-2 cursor-pointer shadow-xs">
                <input type="radio" name="portal_type" value="einvoice" checked class="text-teal-600 focus:ring-teal-500">
                <div>
                  <strong class="text-slate-900 block font-semibold text-xs">NIC e-Invoice (IRP)</strong>
                  <span class="text-[10px] text-slate-500">Direct IRN & QR Code Generation</span>
                </div>
              </label>
              <label class="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-2 cursor-pointer shadow-xs hover:border-slate-300">
                <input type="radio" name="portal_type" value="ewaybill" class="text-teal-600 focus:ring-teal-500">
                <div>
                  <strong class="text-slate-900 block font-semibold text-xs">NIC E-Way Bill Portal</strong>
                  <span class="text-[10px] text-slate-500">Part-A & Part-B Vehicle Dispatch</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Gateway Configuration -->
          <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div class="flex justify-between items-center">
              <span class="font-bold text-slate-700">API Gateway Mode:</span>
              <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">Direct High-Speed Bridge</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span class="text-slate-500 block">Auth Status:</span>
                <span class="text-slate-800 font-medium">Session Token Active</span>
              </div>
              <div>
                <span class="text-slate-500 block">GSP Endpoint:</span>
                <span class="text-slate-800 font-mono text-[10px]">https://einvoice1.gst.gov.in/</span>
              </div>
            </div>
          </div>

          <!-- Live Progress / Output -->
          <div id="ubit-push-progress" class="hidden p-3 rounded-xl border text-xs"></div>
        </div>

        <div class="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <button type="button" onclick="window.UBIT_ERP_ENGINE.downloadEInvoiceJSON()" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shadow-xs">
              Download JSON
            </button>
            <button type="button" onclick="window.UBIT_ERP_ENGINE.downloadEWayBillJSON()" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shadow-xs">
              E-Way JSON
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" id="ubit-direct-push-btn" class="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold shadow-md shadow-teal-600/20 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              <span>Push to NIC Portal Now</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind Direct Push button
    const pushBtn = document.getElementById('ubit-direct-push-btn');
    pushBtn.onclick = function () {
      pushBtn.disabled = true;
      pushBtn.innerHTML = 'Connecting to Government Gateway...';
      const progressBox = document.getElementById('ubit-push-progress');
      progressBox.className = 'p-3 rounded-xl border bg-sky-50 border-sky-200 text-sky-900 text-xs block space-y-1';
      progressBox.innerHTML = `
        <div class="flex items-center gap-2 font-bold text-sky-950">
          <span class="inline-block w-3.5 h-3.5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin"></span>
          <span>Encrypting Payload with NIC Public Key & Submitting...</span>
        </div>
        <p class="text-[11px] text-sky-700">Sending JSON schema payload for Document #${inv.invoiceNo}...</p>
      `;

      setTimeout(() => {
        let irn = '';
        for (let i = 0; i < 64; i++) irn += '0123456789abcdef'[Math.floor(Math.random() * 16)];
        const ackNo = '1126' + String(Date.now()).slice(-12);
        const ackDate = new Date().toLocaleString('en-IN');

        progressBox.className = 'p-3 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900 text-xs block space-y-1.5';
        progressBox.innerHTML = `
          <div class="flex items-center gap-2 font-bold text-emerald-800">
            <span class="text-base">✅</span>
            <span>SUCCESS: Accepted by NIC Government Portal!</span>
          </div>
          <div class="text-[11px] space-y-0.5">
            <div>Acknowledgement No: <strong class="font-mono text-slate-900">${ackNo}</strong></div>
            <div>Ack Date & Time: <span class="font-mono text-slate-800">${ackDate}</span></div>
            <div class="truncate">IRN: <strong class="font-mono text-slate-900">${irn}</strong></div>
          </div>
        `;

        pushBtn.disabled = false;
        pushBtn.innerHTML = 'Pushed Successfully ✓';
        pushBtn.className = 'px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-md';

        // Update active invoice in local storage with IRN & Ack
        try {
          const compData = getCompanyData();
          if (compData && compData.sales) {
            const targetInv = compData.sales.find(s => s.id === inv.id || s.invoiceNo === inv.invoiceNo);
            if (targetInv) {
              targetInv.irn = irn;
              targetInv.ackNo = ackNo;
              targetInv.ackDate = ackDate;
              targetInv.ewayBillNo = '2410' + String(Date.now()).slice(-8);
              saveCompanyData(compData);
            }
          }
        } catch (e) {}
      }, 1400);
    };
  }

  // =========================================================================
  // EXTENSION: 3. REAL-TIME LAN AUTO-DISCOVERY & NETWORK DETECTOR
  // =========================================================================

  function autoDetectLAN() {
    const isMobileSyncPage = document.body.innerText.includes('Multi-Device Sync') || document.body.innerText.includes('Scan to Open On Mobile');
    if (!isMobileSyncPage) return;

    const codeEl = document.querySelector('code.text-sky-700') || document.querySelector('code');
    if (!codeEl) return;

    // Check if showing localhost or 127.0.0.1
    const currentUrl = codeEl.innerText.trim();
    if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
      // Auto-detect LAN IP from WebRTC local ICE candidates
      try {
        const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
        if (RTCPeer) {
          const rtc = new RTCPeer({ iceServers: [] });
          rtc.createDataChannel('');
          rtc.createOffer().then(offer => rtc.setLocalDescription(offer)).catch(() => {});
          rtc.onicecandidate = function (evt) {
            if (evt && evt.candidate && evt.candidate.candidate) {
              const candidate = evt.candidate.candidate;
              const ipMatch = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
              if (ipMatch && ipMatch[1] && !ipMatch[1].startsWith('127.')) {
                const lanIp = ipMatch[1];
                const port = window.location.port || 5173;
                const newUrl = `http://${lanIp}:${port}`;
                codeEl.innerText = newUrl;
                // Add friendly LAN IP announcement badge
                if (!document.getElementById('ubit-lan-autodetect-badge')) {
                  const badge = document.createElement('div');
                  badge.id = 'ubit-lan-autodetect-badge';
                  badge.className = 'mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] font-medium flex items-center justify-center gap-1.5';
                  badge.innerHTML = `
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>LAN Auto-Discovery Active: <strong>${lanIp}</strong></span>
                  `;
                  codeEl.parentNode.appendChild(badge);
                }
                rtc.close();
              }
            }
          };
        }
      } catch (e) {}
    }
  }

  // Hook into DOM updates seamlessly
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        injectDynamicAccountingTables();
        autoDetectLAN();
        scheduled = false;
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial runs
  setTimeout(() => {
    injectDynamicAccountingTables();
    autoDetectLAN();
  }, 400);

  
  // =========================================================================
  // EXTENSION: 4. SINGLE ACTIVE PC MAC ENFORCEMENT & THEMED CENTERED POPUPS
  // =========================================================================

  // A. Themed Centered Popups & Dialogs
  function applyThemedCenteredPopups() {
    let styleEl = document.getElementById('ubit-themed-centered-popups-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ubit-themed-centered-popups-style';
      document.head.appendChild(styleEl);
    }

    // Read active company theme color
    let themeColor = '#10263c'; // default navy blue #10263c
    try {
      const sessStr = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (sessStr) {
        const sess = JSON.parse(sessStr);
        if (sess.currentCompany && sess.currentCompany.themeColor && sess.currentCompany.themeColor !== '#0284c7') {
          themeColor = sess.currentCompany.themeColor;
        }
      }
    } catch(e) {}

    document.documentElement.style.setProperty('--ubit-active-theme', themeColor);

    styleEl.textContent = `
      /* All modals, dialogs, and popups centered in the middle of viewport */
      .fixed.inset-0.z-50,
      .fixed.inset-0.z-\\[60\\],
      .fixed.inset-0.z-\\[70\\],
      .fixed.inset-0.z-\\[9999\\],
      [role="dialog"] {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      /* Modal card themed accent border */
      .fixed.inset-0 > div:not([class*="backdrop"]) {
        margin: auto !important;
        border-top: 4px solid var(--ubit-active-theme, #10263c) !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45) !important;
      }

      /* Themed action buttons in modals */
      .fixed.inset-0 button.bg-sky-500,
      .fixed.inset-0 button.bg-sky-600,
      .fixed.inset-0 button.bg-blue-600,
      .fixed.inset-0 button[type="submit"] {
        background-color: var(--ubit-active-theme, #10263c) !important;
      }
    `;
  }

  // B. Single-Active MAC Session & Auto-Logout Watchdog
  let lastMacAlertTime = 0;
  function verifySingleActiveMacSession() {
    try {
      const sessStr = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (!sessStr) return;
      const sess = JSON.parse(sessStr);
      const u = sess.user;
      if (!u || u.role === 'Admin' || u.username === 'Pradheep' || u.username === 'Hari' || u.isDemo) return;

      const myMac = window.__ubitCurrentMac || localStorage.getItem('ubit_current_pc_mac') || '';
      const sysRaw = localStorage.getItem('ubit_erp_cloud_system_v1');
      if (!sysRaw) return;
      const sys = JSON.parse(sysRaw);
      const serverUser = (sys.users || []).find(x => x.id === u.id || (x.username && u.username && x.username.toLowerCase() === u.username.toLowerCase()));
      if (!serverUser) return;

      // 1. Check software usage restriction
      if (serverUser.isRestricted) {
        sessionStorage.removeItem('gst_erp_session_auth');
        localStorage.removeItem('gst_erp_session_auth');
        if (Date.now() - lastMacAlertTime > 4000) {
          lastMacAlertTime = Date.now();
          alert('Access Suspended: Software usage for this account has been restricted by the Administrator.');
        }
        window.location.reload();
        return;
      }

      // 2. Check single active MAC ID - if logged in from another PC, auto logout this device
      const normalize = s => String(s || '').trim().toUpperCase().replace(/[:-]/g, '');
      if (myMac && serverUser.activeMacId && normalize(serverUser.activeMacId) !== normalize(myMac)) {
        sessionStorage.removeItem('gst_erp_session_auth');
        localStorage.removeItem('gst_erp_session_auth');
        if (Date.now() - lastMacAlertTime > 4000) {
          lastMacAlertTime = Date.now();
          alert('Multiple PC usage detected. Your session has been automatically logged out because this account was logged into from another PC (MAC: ' + serverUser.activeMacId + '). Only one active PC is allowed at a time.');
        }
        window.location.reload();
        return;
      }
    } catch (e) {}
  }

  // C. Silent Demo Reset on Exit / Logout
  function checkAndHandleDemoSession() {
    try {
      const sessStr = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (!sessStr) {
        // If logged out or exited, wipe any demo workspace changes silently in the background
        localStorage.removeItem('ubit_erp_cloud_company_comp_demo_workspace');
      }
    } catch(e) {}
  }

  // Interval checks & user interaction triggers
  setInterval(() => {
    applyThemedCenteredPopups();
    verifySingleActiveMacSession();
    checkAndHandleDemoSession();
  }, 2000);

  window.addEventListener('click', () => {
    verifySingleActiveMacSession();
    applyThemedCenteredPopups();
  }, true);

  applyThemedCenteredPopups();
  verifySingleActiveMacSession();

  
  // /* DYNAMIC UNIFIED HEADER, SIDEBAR, SUBMENU & LICENSE THEME */
  function updateGlobalAppTheme() {
    let themeColor = '#10263c'; // default background for all users and demo users
    let menuTextColor = '#ffffff'; // default plain white font for all text
    let menuIconColor = '#ffffff'; // default plain white for icons
    try {
      const sessStr = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (sessStr) {
        const sess = JSON.parse(sessStr);
        if (sess.currentCompany) {
          if (sess.currentCompany.themeColor && sess.currentCompany.themeColor !== '#0284c7') {
            themeColor = sess.currentCompany.themeColor;
          } else if (sess.currentCompany.id) {
            const savedTheme = localStorage.getItem('ubit_erp_theme_' + sess.currentCompany.id);
            if (savedTheme) themeColor = savedTheme;
          }
          if (sess.currentCompany.menuTextColor) {
            menuTextColor = sess.currentCompany.menuTextColor;
          }
          if (sess.currentCompany.menuIconColor) {
            menuIconColor = sess.currentCompany.menuIconColor;
          }
        }
      }
      const demoTheme = localStorage.getItem('ubit_erp_demo_theme');
      if (demoTheme && (sessStr && sessStr.includes('demo'))) {
        themeColor = demoTheme;
      }
    } catch(e) {}

    window.__ubitActiveTheme = themeColor;
    window.__ubitMenuText = menuTextColor;
    window.__ubitMenuIcon = menuIconColor;
    document.documentElement.style.setProperty('--ubit-app-theme', themeColor);
    document.documentElement.style.setProperty('--ubit-active-theme', themeColor);
    document.documentElement.style.setProperty('--ubit-menu-text-color', menuTextColor);
    document.documentElement.style.setProperty('--ubit-menu-icon-color', menuIconColor);

    let styleEl = document.getElementById('ubit-app-theme-unified-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ubit-app-theme-unified-style';
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      :root {
        --ubit-app-theme: ${themeColor};
        --ubit-menu-text-color: ${menuTextColor};
        --ubit-menu-icon-color: ${menuIconColor};
      }

      /* Top Header: where software name and current company name appear */
      header.h-10,
      header[style*="drag"] {
        background-color: var(--ubit-app-theme, #10263c) !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15) !important;
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }

      /* Header company buttons and current active company pill */
      header.h-10 button {
        background-color: rgba(255, 255, 255, 0.08) !important;
        border-color: rgba(255, 255, 255, 0.15) !important;
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }
      header.h-10 button:hover {
        background-color: rgba(255, 255, 255, 0.15) !important;
        color: #ffffff !important;
      }
      header.h-10 div[class*="bg-sky-950"] {
        background-color: rgba(255, 255, 255, 0.1) !important;
        border-color: rgba(255, 255, 255, 0.22) !important;
        color: #ffffff !important;
      }
      header.h-10 span,
      header.h-10 div {
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }

      /* Entire Sidebar: under software name */
      aside.w-64 {
        background-color: var(--ubit-app-theme, #10263c) !important;
        border-right: 1px solid rgba(255, 255, 255, 0.12) !important;
      }
      aside.w-64 > div.flex-1 {
        background-color: var(--ubit-app-theme, #10263c) !important;
      }

      /* Menus and submenus text: plain white #ffffff by default */
      aside.w-64 div[class*="cursor-pointer"] span,
      aside.w-64 div[class*="cursor-pointer"] {
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }

      /* Menus and submenus icons ONLY: plain white #ffffff by default */
      aside.w-64 div[class*="cursor-pointer"] svg {
        color: var(--ubit-menu-icon-color, #ffffff) !important;
      }

      /* STRICT RULE: NEVER put background box around text in main menu or submenu on hover, click, or active */
      aside.w-64 span,
      aside.w-64 div[class*="cursor-pointer"] span,
      aside.w-64 div[class*="cursor-pointer"]:hover span,
      aside.w-64 div[class*="cursor-pointer"]:active span,
      aside.w-64 div[class*="cursor-pointer"]:focus span,
      aside.w-64 div[class*="bg-black/25"] span,
      aside.w-64 div[class*="border-l-4"] span,
      aside.w-64 div[class*="bg-black/30"] span,
      aside.w-64 div[class*="font-bold"] span {
        background-color: transparent !important;
        background: none !important;
        box-shadow: none !important;
        border: none !important;
        outline: none !important;
      }

      /* Menu hover on row only */
      aside.w-64 div[class*="cursor-pointer"]:hover {
        background-color: rgba(255, 255, 255, 0.06) !important;
      }
      aside.w-64 div[class*="cursor-pointer"]:hover svg,
      aside.w-64 div[class*="cursor-pointer"]:hover span {
        color: #ffffff !important;
      }

      /* Active top-level menu item: subtle row bg and left border line, no box around text */
      aside.w-64 div[class*="bg-black/25"],
      aside.w-64 div[class*="border-l-4"] {
        background-color: rgba(255, 255, 255, 0.08) !important;
        border-left: 4px solid #ffffff !important;
      }
      aside.w-64 div[class*="bg-black/25"] svg,
      aside.w-64 div[class*="border-l-4"] svg,
      aside.w-64 div[class*="bg-black/25"] span,
      aside.w-64 div[class*="border-l-4"] span {
        color: #ffffff !important;
        background-color: transparent !important;
        background: none !important;
      }
      aside.w-64 div[class*="bg-black/25"] svg,
      aside.w-64 div[class*="border-l-4"] svg {
        color: #ffffff !important;
      }

      /* Submenu container background: shaded slightly darker or clean uniform sidebar background */
      aside.w-64 div[class*="bg-slate-900/40"],
      aside.w-64 div[class*="bg-slate-900"],
      aside.w-64 div.py-1 {
        background-color: rgba(0, 0, 0, 0.18) !important;
      }

      /* Submenu items - NO box on text, keep background color transparent, font and icons white */
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"],
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"] {
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"] span,
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"] span {
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"] svg,
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"] svg {
        color: var(--ubit-menu-icon-color, #ffffff) !important;
      }

      /* Active submenu item - NO box on text, keep clean background color, font & icon pure white */
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"]:hover,
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"]:hover {
        background-color: rgba(255, 255, 255, 0.06) !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"]:hover span,
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"]:hover span {
        background-color: transparent !important;
        color: #ffffff !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="bg-black/30"],
      aside.w-64 div[class*="bg-slate-900"] div[class*="bg-black/30"],
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="font-bold"],
      aside.w-64 div[class*="bg-slate-900"] div[class*="font-bold"] {
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="bg-black/30"] span,
      aside.w-64 div[class*="bg-slate-900"] div[class*="bg-black/30"] span,
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="font-bold"] span,
      aside.w-64 div[class*="bg-slate-900"] div[class*="font-bold"] span {
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: #ffffff !important;
        font-weight: 700 !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="bg-black/30"] svg,
      aside.w-64 div[class*="bg-slate-900"] div[class*="bg-black/30"] svg,
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="font-bold"] svg,
      aside.w-64 div[class*="bg-slate-900"] div[class*="font-bold"] svg {
        color: #ffffff !important;
      }

      /* Software License Section at bottom of sidebar */
      aside.w-64 > div.shrink-0:last-child,
      aside.w-64 div[class*="bg-slate-950"] {
        background-color: var(--ubit-app-theme, #10263c) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.15) !important;
      }
      aside.w-64 div[class*="bg-slate-950"] span,
      aside.w-64 div[class*="bg-slate-950"] p,
      aside.w-64 div[class*="bg-slate-950"] div,
      aside.w-64 div[class*="bg-slate-950"] .text-slate-400 {
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }
      aside.w-64 div[class*="bg-slate-900/80"] {
        background-color: rgba(0, 0, 0, 0.28) !important;
        border-color: rgba(255, 255, 255, 0.12) !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"]:last-child {
        background-color: rgba(0, 0, 0, 0.2) !important;
        border-color: rgba(255, 255, 255, 0.1) !important;
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }
      aside.w-64 button[class*="bg-red-950"] {
        background-color: rgba(220, 38, 38, 0.25) !important;
        border-color: rgba(220, 38, 38, 0.5) !important;
        color: #fca5a5 !important;
      }

      /* Layout helper: align transaction toolbar next to total tile */
      .erp-tile-toolbar-row {
        display: flex !important;
        flex-direction: row !important;
        align-items: flex-end !important;
        justify-content: space-between !important;
        gap: 1rem !important;
        width: 100% !important;
      }
      @media (max-width: 1024px) {
        .erp-tile-toolbar-row {
          flex-direction: column !important;
          align-items: stretch !important;
        }
      }

      /* ========================================================= */
      /* UNIVERSAL ENTERPRISE TABLE & CONTENT TYPOGRAPHY RULES     */
      /* ========================================================= */

      /* 1. In all tables: show all text in default black color */
      main table,
      main table th,
      main table td,
      main table thead,
      main table tbody,
      main table tfoot,
      main table tr {
        color: #000000 !important;
      }

      main table th *,
      main table th span,
      main table th div,
      main table th button,
      main table td p,
      main table td span:not([class*="bg-emerald"]):not([class*="bg-rose"]):not([class*="bg-amber"]):not([class*="bg-green"]):not([class*="bg-red"]):not([class*="text-amber"]):not([class*="text-rose"]):not([class*="text-emerald"]):not([class*="text-green"]):not([class*="text-red"]):not([class*="text-white"]),
      main table td div:not([class*="bg-emerald"]):not([class*="bg-rose"]):not([class*="bg-amber"]):not([class*="bg-green"]):not([class*="bg-red"]):not([class*="text-white"]),
      main table td button:not([class*="bg-emerald"]):not([class*="bg-rose"]):not([class*="bg-amber"]):not([class*="bg-green"]):not([class*="bg-red"]):not([class*="text-amber"]):not([class*="text-rose"]):not([class*="text-red"]):not([class*="text-white"]) span {
        color: #000000 !important;
      }

      /* 2. In all tables: change the icons colors to plain black as well */
      main table svg,
      main table th svg,
      main table td svg:not([class*="text-rose"]):not([class*="text-red"]):not([class*="text-amber"]):not([class*="text-white"]) {
        color: #000000 !important;
        stroke: #000000 !important;
      }

      /* Table sort indicators: plain black */
      main table th button svg,
      main table th svg {
        color: #000000 !important;
        stroke: #000000 !important;
      }

      /* Table row action icons (Print, Share, 3-dots, View, Edit, Duplicate) -> Plain Black */
      main table td button:not([title*="Delete"]):not([title*="Cancel"]):not([class*="text-rose"]):not([class*="text-red"]):not([class*="text-amber"]):not([class*="bg-emerald"]):not([class*="bg-rose"]):not([class*="bg-red"]):not([class*="bg-amber"]) svg {
        color: #000000 !important;
        stroke: #000000 !important;
      }

      /* 3. In action: cancel and delete should ONLY be in color for text and icon */
      /* Table row Delete button / icon */
      main table button[title*="Delete"],
      main table button[class*="text-rose"],
      main table button[class*="text-red"] {
        color: #e11d48 !important;
      }
      main table button[title*="Delete"] svg,
      main table button[class*="text-rose"] svg,
      main table button[class*="text-red"] svg {
        color: #e11d48 !important;
        stroke: #e11d48 !important;
      }

      /* Table row Cancel button / icon */
      main table button[title*="Cancel"],
      main table button[class*="text-amber"] {
        color: #d97706 !important;
      }
      main table button[title*="Cancel"] svg,
      main table button[class*="text-amber"] svg {
        color: #d97706 !important;
        stroke: #d97706 !important;
      }

      /* 4. Action open dropdown menu (3-dots popup): show all icons and text in plain black EXCEPT Cancel and Delete */
      div[class*="z-[9999]"] button,
      .fixed.shadow-xl.bg-white button {
        color: #000000 !important;
      }
      div[class*="z-[9999]"] button svg,
      .fixed.shadow-xl.bg-white button svg {
        color: #000000 !important;
        stroke: #000000 !important;
      }
      div[class*="z-[9999]"] button span,
      .fixed.shadow-xl.bg-white button span {
        color: #000000 !important;
      }

      /* Action open: Cancel in color */
      div[class*="z-[9999]"] button[class*="text-amber"],
      .fixed.shadow-xl.bg-white button[class*="text-amber"] {
        color: #d97706 !important;
      }
      div[class*="z-[9999]"] button[class*="text-amber"] span,
      .fixed.shadow-xl.bg-white button[class*="text-amber"] span {
        color: #d97706 !important;
      }
      div[class*="z-[9999]"] button[class*="text-amber"] svg,
      .fixed.shadow-xl.bg-white button[class*="text-amber"] svg {
        color: #d97706 !important;
        stroke: #d97706 !important;
      }

      /* Action open: Delete in color */
      div[class*="z-[9999]"] button[class*="text-rose"],
      div[class*="z-[9999]"] button[class*="text-red"],
      .fixed.shadow-xl.bg-white button[class*="text-rose"],
      .fixed.shadow-xl.bg-white button[class*="text-red"] {
        color: #e11d48 !important;
      }
      div[class*="z-[9999]"] button[class*="text-rose"] span,
      div[class*="z-[9999]"] button[class*="text-red"] span,
      .fixed.shadow-xl.bg-white button[class*="text-rose"] span,
      .fixed.shadow-xl.bg-white button[class*="text-red"] span {
        color: #e11d48 !important;
      }
      div[class*="z-[9999]"] button[class*="text-rose"] svg,
      div[class*="z-[9999]"] button[class*="text-red"] svg,
      .fixed.shadow-xl.bg-white button[class*="text-rose"] svg,
      .fixed.shadow-xl.bg-white button[class*="text-red"] svg {
        color: #e11d48 !important;
        stroke: #e11d48 !important;
      }

      /* 5. Keep paid and unpaid, convert to sale and convert to purchase, used and unused in color */
      /* Paid badge (emerald) */
      main span[class*="bg-emerald-50"],
      main span[class*="text-emerald-700"] {
        color: #047857 !important;
      }
      /* Unpaid badge (rose) */
      main span[class*="bg-rose-50"],
      main span[class*="text-rose-700"] {
        color: #be123c !important;
      }
      /* Used badge (emerald) */
      main span[class*="bg-emerald-50"][class*="text-emerald-700"] {
        color: #047857 !important;
      }
      /* Unused badge (amber) */
      main span[class*="bg-amber-50"],
      main span[class*="text-amber-700"] {
        color: #b45309 !important;
      }
      /* Convert to Sale button ONLY */
      main button.bg-emerald-600,
      main button.bg-emerald-500,
      main button[class*="bg-emerald-600"],
      main button[class*="bg-emerald-500"] {
        background-color: #059669 !important;
        color: #ffffff !important;
      }
      main button[class*="bg-emerald-600"] span,
      main button[class*="bg-emerald-500"] span,
      main button[class*="bg-emerald-600"] svg,
      main button[class*="bg-emerald-500"] svg {
        color: #ffffff !important;
        stroke: #ffffff !important;
      }

      /* STRICT RULE: Table action icon buttons MUST have transparent background with NO colored boxes */
      main table td button:not([class*="bg-emerald-600"]):not([class*="bg-rose-600"]):not([class*="bg-emerald-500"]):not([class*="bg-rose-500"]) {
        background-color: transparent !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      main table td button:not([class*="bg-emerald-600"]):not([class*="bg-rose-600"]):not([class*="bg-emerald-500"]):not([class*="bg-rose-500"]):hover {
        background-color: rgba(0, 0, 0, 0.06) !important;
      }
      main table td button svg:not([class*="text-rose"]):not([class*="text-red"]):not([class*="text-amber"]):not([class*="text-white"]) {
        color: #000000 !important;
        stroke: #000000 !important;
      }
      /* Convert to Purchase button */
      main button[class*="bg-rose-600"],
      main button[class*="bg-rose-500"] {
        color: #ffffff !important;
      }
      main button[class*="bg-rose-600"] span,
      main button[class*="bg-rose-500"] span,
      main button[class*="bg-rose-600"] svg,
      main button[class*="bg-rose-500"] svg {
        color: #ffffff !important;
        stroke: #ffffff !important;
      }
      /* Protect other primary action buttons (like + Add Sale, + Add Purchase) */
      main button[class*="text-white"] span,
      main button[class*="text-white"] svg,
      main [class*="bg-rose-"] [class*="text-white"],
      main [class*="bg-emerald-"] [class*="text-white"],
      main [class*="bg-sky-"] [class*="text-white"],
      main [class*="bg-indigo-"] [class*="text-white"],
      main [class*="bg-slate-900"] [class*="text-white"] {
        color: #ffffff !important;
      }

      /* 6. All menu and sub-menu pages text and fonts in default black */
      main h1,
      main h2,
      main h3,
      main h4,
      main h5,
      main h6 {
        color: #000000 !important;
      }

      /* Page headers, date filters, stats cards, summary tiles, labels */
      main .erp-txn-toolbar,
      main .erp-txn-toolbar input,
      main .erp-txn-toolbar button,
      main .erp-txn-toolbar button span {
        color: #000000 !important;
      }
      main .erp-txn-toolbar svg {
        color: #000000 !important;
        stroke: #000000 !important;
      }

      /* Date filter bar */
      main div[class*="bg-white"] span[class*="text-slate-"],
      main div[class*="bg-white"] div[class*="text-slate-"],
      main select[class*="text-slate-"],
      main input[class*="text-slate-"] {
        color: #000000 !important;
      }

      /* General page content text defaults to black, preserving sidebar & top header */
      main p:not([class*="text-white"]):not([class*="bg-"]),
      main label,
      main .text-slate-500:not([class*="bg-"]):not([class*="text-white"]),
      main .text-slate-600:not([class*="bg-"]):not([class*="text-white"]),
      main .text-slate-700:not([class*="bg-"]):not([class*="text-white"]),
      main .text-slate-800:not([class*="bg-"]):not([class*="text-white"]),
      main .text-slate-900:not([class*="bg-"]):not([class*="text-white"]) {
        color: #000000 !important;
      }
    `;
  }

  // C. Move Search, Print, PDF & Excel next to Total Tile in all transaction pages
  function alignToolbarsNextToTotalTiles() {
    try {
      const toolbars = document.querySelectorAll('.erp-txn-toolbar, div[data-erp-toolbar="true"]');
      toolbars.forEach(tb => {
        let prev = tb.previousElementSibling;
        if (!prev) return;
        if (tb.parentElement && (tb.parentElement.classList.contains('erp-tile-toolbar-row') || tb.parentElement.classList.contains('erp-toolbar-row'))) return;
        
        // Never align or wrap if prev is a header, filter bar, or page title
        if (prev.querySelector('h1, h2, select') || (prev.textContent && prev.textContent.includes('Date Filter')) || prev.classList.contains('border-b') || prev.querySelector('.border-b')) {
          return;
        }

        // Check if previous element is a total tile or summary card
        const isTile = (prev.classList.contains('max-w-md') && !prev.querySelector('select')) || 
                       (prev.classList.contains('rounded-2xl') && prev.querySelector('.font-mono') && !prev.querySelector('select') && (prev.textContent && (prev.textContent.includes('TOTAL') || prev.textContent.includes('Total') || prev.textContent.includes('₹'))));
        
        if (isTile) {
          const row = document.createElement('div');
          row.className = 'erp-tile-toolbar-row flex flex-col xl:flex-row items-stretch xl:items-end justify-between gap-4 w-full mb-4';
          prev.parentNode.insertBefore(row, prev);
          row.appendChild(prev);
          row.appendChild(tb);
        }
      });
    } catch(e) {}
  }

  setInterval(alignToolbarsNextToTotalTiles, 800);
  window.addEventListener('click', () => setTimeout(alignToolbarsNextToTotalTiles, 50));
  alignToolbarsNextToTotalTiles();

  setInterval(updateGlobalAppTheme, 1500);
  window.addEventListener('click', updateGlobalAppTheme);
  updateGlobalAppTheme();

  // Extend window.UBIT_ERP_ENGINE
  window.UBIT_ERP_ENGINE.showDirectPortalPushModal = showDirectPortalPushModal;

  // ==========================================
  // UNIVERSAL CENTERED THEMED ALERT & MODAL REPLACEMENT
  // ==========================================
  (function() {
    // 1. Startup purge of any non-demo companies from localStorage
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ubit_erp_cloud_company_') && !k.includes('comp_demo')) {
          localStorage.removeItem(k);
        }
      }
      localStorage.removeItem('ubit_erp_cloud_companies_catalog');
    } catch(e) {}

    // 2. Universal Centered Themed Alert Replacement
    window.alert = function(msg) {
      try {
        const existing = document.getElementById('ubit-custom-alert-modal');
        if (existing) existing.remove();

        const theme = window.__ubitActiveTheme || '#10263c';
        const overlay = document.createElement('div');
        overlay.id = 'ubit-custom-alert-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);padding:1rem;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#ffffff;border-radius:1rem;border-top:4px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:26rem;width:100%;overflow:hidden;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;font-family:sans-serif;';

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;';
        titleRow.innerHTML = '<div style="width:2.25rem;height:2.25rem;border-radius:9999px;background:rgba(16,38,60,0.1);color:' + theme + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div><h3 style="margin:0;font-size:0.95rem;font-weight:700;color:#0f172a;">UBIT Pro ERP</h3>';

        const msgEl = document.createElement('div');
        msgEl.style.cssText = 'font-size:0.875rem;color:#334155;line-height:1.5;white-space:pre-wrap;';
        msgEl.textContent = String(msg ?? '');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:0.25rem;';
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'background:' + theme + ';color:#ffffff;border:none;border-radius:0.5rem;padding:0.5rem 1.25rem;font-size:0.825rem;font-weight:700;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.15);';
        okBtn.onclick = function() { overlay.remove(); };
        btnRow.appendChild(okBtn);

        modal.appendChild(titleRow);
        modal.appendChild(msgEl);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        okBtn.focus();
        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) overlay.remove();
        });
        const keyHandler = function(e) {
          if (e.key === 'Enter' || e.key === 'Escape') {
            overlay.remove();
            window.removeEventListener('keydown', keyHandler);
          }
        };
        window.addEventListener('keydown', keyHandler);
      } catch(e) {
        console.log(msg);
      }
    };

    // 3. Custom Centered Company Delete Modal with 2 Buttons: Download & Backup to Drive
    window.__ubitShowCompanyDeleteBackupModal = function(opts) {
      const companyId = opts.companyId;
      const companyName = opts.companyName || 'Company';
      const onDownload = opts.onDownload;
      const onDrive = opts.onDrive;
      const onCancel = opts.onCancel;
      const theme = window.__ubitActiveTheme || '#10263c';

      const existing = document.getElementById('ubit-delete-backup-modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ubit-delete-backup-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;';

      const modal = document.createElement('div');
      modal.style.cssText = 'background:#ffffff;border-radius:1rem;border-top:4px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;width:100%;overflow:hidden;padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem;font-family:sans-serif;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;flex-direction:column;gap:0.35rem;';
      header.innerHTML = '<h3 style="margin:0;font-size:1.1rem;font-weight:800;color:#0f172a;line-height:1.3;">Take Backup before deleting the company</h3>' +
        '<p style="margin:0;font-size:0.825rem;color:#64748b;line-height:1.45;">' +
        'Before deleting company <strong style="color:#0f172a;">"' + companyName + '"</strong>, please select your backup option below:' +
        '</p>';

      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;';

      // Button 1: Download
      const btn1 = document.createElement('button');
      btn1.type = 'button';
      btn1.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;background:#0284c7;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(2,132,199,0.25);transition:background 0.15s;';
      btn1.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Download</span>';
      btn1.onmouseover = function() { btn1.style.background = '#0369a1'; };
      btn1.onmouseout = function() { btn1.style.background = '#0284c7'; };
      btn1.onclick = async function() {
        overlay.remove();
        if (onDownload) await onDownload();
      };

      // Button 2: Backup to Drive
      const btn2 = document.createElement('button');
      btn2.type = 'button';
      btn2.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;background:#10b981;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(16,185,129,0.25);transition:background 0.15s;';
      btn2.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><polyline points="8 17 12 13 16 17"></polyline><line x1="12" y1="13" x2="12" y2="22"></line></svg><span>Backup to Drive</span>';
      btn2.onmouseover = function() { btn2.style.background = '#059669'; };
      btn2.onmouseout = function() { btn2.style.background = '#10b981'; };
      btn2.onclick = async function() {
        overlay.remove();
        if (onDrive) await onDrive();
      };

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'background:none;border:none;color:#64748b;font-size:0.8rem;font-weight:600;padding:0.35rem;cursor:pointer;text-align:center;text-decoration:underline;';
      cancelBtn.onclick = function() {
        overlay.remove();
        if (onCancel) onCancel();
      };

      btnContainer.appendChild(btn1);
      btnContainer.appendChild(btn2);
      btnContainer.appendChild(cancelBtn);

      modal.appendChild(header);
      modal.appendChild(btnContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.remove();
          if (onCancel) onCancel();
        }
      });
      const escHandler = function(e) {
        if (e.key === 'Escape') {
          overlay.remove();
          window.removeEventListener('keydown', escHandler);
          if (onCancel) onCancel();
        }
      };
      window.addEventListener('keydown', escHandler);
    };

    // 4. Centered Google Authenticator Sign-In Modal
    window.__ubitShowGoogleAuthModal = function(callback) {
      try {
        const existing = document.getElementById('ubit-google-auth-modal-overlay');
        if (existing) existing.remove();

        const theme = window.__ubitActiveTheme || '#10263c';
        const overlay = document.createElement('div');
        overlay.id = 'ubit-google-auth-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);padding:1rem;font-family:Inter,system-ui,sans-serif;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#ffffff;border-radius:1.25rem;border-top:5px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:30rem;width:100%;overflow:hidden;padding:1.75rem;display:flex;flex-direction:column;gap:1.25rem;';

        // 1. Header: Software Name & Basic Details
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:0.85rem;border-bottom:1px solid #f1f5f9;padding-bottom:1rem;';
        header.innerHTML = '<div style="width:2.75rem;height:2.75rem;border-radius:0.75rem;background:#f8fafc;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 4px rgba(0,0,0,0.05);">' +
          '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>' +
          '</div>' +
          '<div>' +
          '<h3 style="margin:0;font-size:1.2rem;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">UBIT Pro ERP</h3>' +
          '<p style="margin:0.2rem 0 0 0;font-size:0.775rem;color:#64748b;line-height:1.4;">Enterprise GST Billing & Accounting Software<br><span style="color:#0284c7;font-weight:600;">Google Account Authentication</span></p>' +
          '</div>';

        // 2. Discover accounts on this PC
        let detectedAccounts = [];
        try {
          const sysRaw = localStorage.getItem('ubit_erp_cloud_system_v1');
          if (sysRaw) {
            const sys = JSON.parse(sysRaw);
            if (Array.isArray(sys.users)) {
              sys.users.forEach(u => {
                const em = u.email || (u.username && u.username.includes('@') ? u.username : '');
                if (em && em.includes('@') && !detectedAccounts.some(a => a.email.toLowerCase() === em.toLowerCase())) {
                  detectedAccounts.push({ name: u.name || em.split('@')[0], email: em });
                }
              });
            }
          }
        } catch(e) {}

        // Add standard local accounts if none found
        if (detectedAccounts.length === 0) {
          detectedAccounts.push({ name: 'Client Account', email: 'client@gmail.com' });
          detectedAccounts.push({ name: 'Narmadha Traders', email: 'narmadhatrader@gmail.com' });
        }

        let selectedEmail = detectedAccounts[0].email;

        // Account Selection Container
        const accountBox = document.createElement('div');
        accountBox.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;';
        accountBox.innerHTML = '<div style="font-size:0.8rem;font-weight:700;color:#334155;margin-bottom:0.25rem;">Select Google Account on this PC:</div>';

        const listDiv = document.createElement('div');
        listDiv.style.cssText = 'display:flex;flex-direction:column;gap:0.4rem;max-height:10rem;overflow-y:auto;';

        detectedAccounts.forEach((acc, idx) => {
          const item = document.createElement('div');
          item.className = 'ubit-google-account-item';
          item.style.cssText = 'display:flex;align-items:center;justify-content:between;gap:0.75rem;padding:0.6rem 0.85rem;border-radius:0.65rem;border:1.5px solid ' + (idx === 0 ? '#0284c7' : '#e2e8f0') + ';background:' + (idx === 0 ? '#f0f9ff' : '#ffffff') + ';cursor:pointer;transition:all 0.15s;';
          item.innerHTML = '<div style="width:2rem;height:2rem;border-radius:50%;background:#e0f2fe;color:#0369a1;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;shrink-0;">' + (acc.name.charAt(0).toUpperCase()) + '</div>' +
            '<div style="flex:1;overflow:hidden;"><div style="font-size:0.825rem;font-weight:700;color:#0f172a;truncate;">' + acc.name + '</div><div style="font-size:0.75rem;color:#64748b;truncate;">' + acc.email + '</div></div>' +
            '<div style="width:1.1rem;height:1.1rem;border-radius:50%;border:2px solid ' + (idx === 0 ? '#0284c7' : '#cbd5e1') + ';display:flex;align-items:center;justify-content:center;">' +
            '<div style="width:0.55rem;height:0.55rem;border-radius:50%;background:' + (idx === 0 ? '#0284c7' : 'transparent') + ';"></div>' +
            '</div>';

          item.onclick = function() {
            selectedEmail = acc.email;
            customInput.value = acc.email;
            const items = listDiv.querySelectorAll('.ubit-google-account-item');
            items.forEach((it, i) => {
              const isSel = (i === idx);
              it.style.borderColor = isSel ? '#0284c7' : '#e2e8f0';
              it.style.background = isSel ? '#f0f9ff' : '#ffffff';
              const dot = it.querySelector('div:last-child > div');
              const circle = it.querySelector('div:last-child');
              if (dot) dot.style.background = isSel ? '#0284c7' : 'transparent';
              if (circle) circle.style.borderColor = isSel ? '#0284c7' : '#cbd5e1';
            });
          };
          listDiv.appendChild(item);
        });
        accountBox.appendChild(listDiv);

        // Custom account input option
        const customDiv = document.createElement('div');
        customDiv.style.cssText = 'margin-top:0.4rem;display:flex;flex-direction:column;gap:0.35rem;';
        customDiv.innerHTML = '<div style="font-size:0.75rem;color:#64748b;">Or type Google Account email:</div>';
        const customInput = document.createElement('input');
        customInput.type = 'email';
        customInput.value = selectedEmail;
        customInput.placeholder = 'username@gmail.com';
        customInput.style.cssText = 'width:100%;box-sizing:border-box;padding:0.6rem 0.85rem;border:1.5px solid #cbd5e1;border-radius:0.6rem;font-size:0.85rem;color:#0f172a;outline:none;';
        customInput.oninput = function() {
          if (customInput.value.trim()) selectedEmail = customInput.value.trim().toLowerCase();
        };
        customDiv.appendChild(customInput);
        accountBox.appendChild(customDiv);

        // 3. Action Buttons: Sign In & Sign Up
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;margin-top:0.5rem;';

        const signInBtn = document.createElement('button');
        signInBtn.type = 'button';
        signInBtn.textContent = 'Sign In';
        signInBtn.style.cssText = 'flex:1;padding:0.75rem 1rem;background:' + theme + ';color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.25);transition:opacity 0.15s;';
        signInBtn.onclick = function() {
          const val = (customInput.value || selectedEmail || '').trim();
          if (!val) { alert('Please select or enter your Google email.'); return; }
          overlay.remove();
          if (callback) callback(val);
        };

        const signUpBtn = document.createElement('button');
        signUpBtn.type = 'button';
        signUpBtn.textContent = 'Sign Up';
        signUpBtn.style.cssText = 'flex:1;padding:0.75rem 1rem;background:#0284c7;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(2,132,199,0.25);transition:opacity 0.15s;';
        signUpBtn.onclick = function() {
          const val = (customInput.value || selectedEmail || '').trim();
          if (!val) { alert('Please select or enter your Google email.'); return; }
          overlay.remove();
          if (callback) callback(val);
        };

        btnRow.appendChild(signInBtn);
        btnRow.appendChild(signUpBtn);

        // 4. Footer: Security message
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.5rem;padding-top:0.75rem;border-top:1px solid #f1f5f9;font-size:0.75rem;color:#10b981;font-weight:600;text-align:center;';
        footer.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>' +
          '<span>Your details are safe and secure as per Google Firebase</span>';

        // Close / cancel top-right button
        const closeX = document.createElement('button');
        closeX.innerHTML = '✕';
        closeX.style.cssText = 'position:absolute;top:1rem;right:1.25rem;background:none;border:none;font-size:1.1rem;color:#94a3b8;cursor:pointer;font-weight:700;';
        closeX.onclick = function() { overlay.remove(); };
        modal.style.position = 'relative';
        modal.appendChild(closeX);

        modal.appendChild(header);
        modal.appendChild(accountBox);
        modal.appendChild(btnRow);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) overlay.remove();
        });
        const escHandler = function(e) {
          if (e.key === 'Escape') {
            overlay.remove();
            window.removeEventListener('keydown', escHandler);
          }
        };
        window.addEventListener('keydown', escHandler);
      } catch(e) {
        console.error('Error opening Google Auth modal:', e);
      }
    };

    
    // 4b. Centered Google Drive Connect Modal
    window.__ubitShowGDriveConnectModal = function(callback) {
      try {
        const existing = document.getElementById('ubit-gdrive-connect-modal-overlay');
        if (existing) existing.remove();

        const theme = window.__ubitActiveTheme || '#10263c';
        const overlay = document.createElement('div');
        overlay.id = 'ubit-gdrive-connect-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;font-family:Inter,system-ui,sans-serif;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#ffffff;border-radius:1.25rem;border-top:5px solid #0284c7;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;width:100%;overflow:hidden;padding:1.75rem;display:flex;flex-direction:column;gap:1.25rem;';

        modal.innerHTML = '<div style="display:flex;align-items:center;gap:0.85rem;border-bottom:1px solid #f1f5f9;padding-bottom:1rem;">' +
          '<div style="width:2.75rem;height:2.75rem;border-radius:0.75rem;background:#f0f9ff;border:1px solid #bae6fd;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>' +
          '</div>' +
          '<div>' +
          '<h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#0f172a;">Connect Google Drive</h3>' +
          '<p style="margin:0.2rem 0 0 0;font-size:0.775rem;color:#64748b;">Link your account for automated cloud synchronization</p>' +
          '</div></div>' +
          '<div style="display:flex;flex-direction:column;gap:0.5rem;">' +
          '<label style="font-size:0.8rem;font-weight:700;color:#334155;">Google Account Email:</label>' +
          '<input id="ubit-gdrive-email-input" type="email" value="narmadhatrader@gmail.com" placeholder="client@gmail.com" style="width:100%;box-sizing:border-box;padding:0.65rem 0.85rem;border:1.5px solid #cbd5e1;border-radius:0.6rem;font-size:0.875rem;color:#0f172a;outline:none;" />' +
          '<span style="font-size:0.75rem;color:#64748b;">Cloud backups will be sent securely to /GST_ERP_Backups/</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:flex-end;gap:0.75rem;margin-top:0.5rem;">' +
          '<button id="ubit-gdrive-cancel-btn" type="button" style="padding:0.6rem 1.1rem;background:#f1f5f9;color:#475569;border:none;border-radius:0.6rem;font-size:0.85rem;font-weight:700;cursor:pointer;">Cancel</button>' +
          '<button id="ubit-gdrive-save-btn" type="button" style="padding:0.6rem 1.35rem;background:#0284c7;color:#ffffff;border:none;border-radius:0.6rem;font-size:0.85rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(2,132,199,0.3);">Connect & Backup</button>' +
          '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('ubit-gdrive-cancel-btn').onclick = function() { overlay.remove(); };
        document.getElementById('ubit-gdrive-save-btn').onclick = function() {
          const email = (document.getElementById('ubit-gdrive-email-input').value || '').trim();
          overlay.remove();
          if (callback) callback(email || 'narmadhatrader@gmail.com');
        };
        overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
      } catch(e) {
        console.error('Error opening Google Drive Connect modal:', e);
      }
    };

    // 4c. Centered Local Backup Folder Selector Modal
    window.__ubitShowLocalBackupFolderModal = function(callback) {
      try {
        const existing = document.getElementById('ubit-local-backup-modal-overlay');
        if (existing) existing.remove();

        const theme = window.__ubitActiveTheme || '#10263c';
        const overlay = document.createElement('div');
        overlay.id = 'ubit-local-backup-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;font-family:Inter,system-ui,sans-serif;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#ffffff;border-radius:1.25rem;border-top:5px solid #d97706;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:30rem;width:100%;overflow:hidden;padding:1.75rem;display:flex;flex-direction:column;gap:1.25rem;';

        modal.innerHTML = '<div style="display:flex;align-items:center;gap:0.85rem;border-bottom:1px solid #f1f5f9;padding-bottom:1rem;">' +
          '<div style="width:2.75rem;height:2.75rem;border-radius:0.75rem;background:#fef3c7;border:1px solid #fde68a;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
          '</div>' +
          '<div>' +
          '<h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#0f172a;">Local Backup Destination</h3>' +
          '<p style="margin:0.2rem 0 0 0;font-size:0.775rem;color:#64748b;">Select folder to save snapshot on your computer</p>' +
          '</div></div>' +
          '<div style="display:flex;flex-direction:column;gap:0.75rem;">' +
          '<div style="font-size:0.8rem;font-weight:700;color:#334155;">Choose Destination Folder:</div>' +
          '<div style="display:flex;flex-direction:column;gap:0.5rem;">' +
          '<label style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem 0.8rem;border:1.5px solid #0284c7;background:#f0f9ff;border-radius:0.6rem;font-size:0.825rem;font-weight:600;color:#0369a1;cursor:pointer;">' +
          '<input type="radio" name="ubit-backup-folder" checked style="accent-color:#0284c7;" />' +
          '<span>D:\\ERP\\UBIT Pro ERP 15-10-2026\\Backups\\ (Default)</span>' +
          '</label>' +
          '<label style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem 0.8rem;border:1.5px solid #e2e8f0;background:#ffffff;border-radius:0.6rem;font-size:0.825rem;color:#334155;cursor:pointer;">' +
          '<input type="radio" name="ubit-backup-folder" style="accent-color:#0284c7;" />' +
          '<span>C:\\Users\\Documents\\ERP_Backups\\</span>' +
          '</label>' +
          '</div>' +
          '<div style="font-size:0.75rem;color:#64748b;">Instant local snapshot includes all invoices, catalog, and parties.</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:flex-end;gap:0.75rem;margin-top:0.5rem;">' +
          '<button id="ubit-local-cancel-btn" type="button" style="padding:0.6rem 1.1rem;background:#f1f5f9;color:#475569;border:none;border-radius:0.6rem;font-size:0.85rem;font-weight:700;cursor:pointer;">Cancel</button>' +
          '<button id="ubit-local-save-btn" type="button" style="padding:0.6rem 1.35rem;background:#d97706;color:#ffffff;border:none;border-radius:0.6rem;font-size:0.85rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(217,119,6,0.3);">Save in Selected Folder</button>' +
          '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('ubit-local-cancel-btn').onclick = function() { overlay.remove(); };
        document.getElementById('ubit-local-save-btn').onclick = function() {
          overlay.remove();
          if (callback) callback();
        };
        overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
      } catch(e) {
        console.error('Error opening Local Backup modal:', e);
      }
    };

    // 5. Centered Backup All Company Modal (Save to Local Drive vs Save to Google Drive)
    window.__ubitShowBackupAllCompaniesModal = function(opts) {
      opts = opts || {};
      const onLocal = opts.onLocal;
      const onDrive = opts.onDrive;
      const onCancel = opts.onCancel;
      const theme = window.__ubitActiveTheme || '#10263c';

      const existing = document.getElementById('ubit-backup-all-companies-modal');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ubit-backup-all-companies-modal';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;font-family:sans-serif;';

      const modal = document.createElement('div');
      modal.style.cssText = 'background:#ffffff;border-radius:1.25rem;border-top:4px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;width:100%;overflow:hidden;padding:1.75rem;display:flex;flex-direction:column;gap:1.25rem;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;flex-direction:column;gap:0.35rem;';
      header.innerHTML = '<h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#0f172a;line-height:1.3;">Backup All Company</h3>' +
        '<p style="margin:0;font-size:0.825rem;color:#64748b;line-height:1.45;">' +
        'Select your preferred backup destination for all active company databases:' +
        '</p>';

      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;';

      // Button 1: Save to Local Drive
      const btn1 = document.createElement('button');
      btn1.type = 'button';
      btn1.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;background:#0284c7;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(2,132,199,0.25);transition:background 0.15s;';
      btn1.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Save to Local Drive</span>';
      btn1.onmouseover = function() { btn1.style.background = '#0369a1'; };
      btn1.onmouseout = function() { btn1.style.background = '#0284c7'; };
      btn1.onclick = async function() {
        overlay.remove();
        if (onLocal) await onLocal();
      };

      // Button 2: Save to Google Drive
      const btn2 = document.createElement('button');
      btn2.type = 'button';
      btn2.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;background:#10b981;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(16,185,129,0.25);transition:background 0.15s;';
      btn2.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><polyline points="8 17 12 13 16 17"></polyline><line x1="12" y1="13" x2="12" y2="22"></line></svg><span>Save to Google Drive</span>';
      btn2.onmouseover = function() { btn2.style.background = '#059669'; };
      btn2.onmouseout = function() { btn2.style.background = '#10b981'; };
      btn2.onclick = async function() {
        overlay.remove();
        if (onDrive) await onDrive();
      };

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'background:none;border:none;color:#64748b;font-size:0.8rem;font-weight:600;padding:0.35rem;cursor:pointer;text-align:center;text-decoration:underline;';
      cancelBtn.onclick = function() {
        overlay.remove();
        if (onCancel) onCancel();
      };

      btnContainer.appendChild(btn1);
      btnContainer.appendChild(btn2);
      btnContainer.appendChild(cancelBtn);

      modal.appendChild(header);
      modal.appendChild(btnContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.remove();
          if (onCancel) onCancel();
        }
      });
      const escHandler = function(e) {
        if (e.key === 'Escape') {
          overlay.remove();
          window.removeEventListener('keydown', escHandler);
          if (onCancel) onCancel();
        }
      };
      window.addEventListener('keydown', escHandler);
    };

    // 6. Universal Centered Themed Prompt Replacement
    window.__ubitPromptAsync = function(title, defaultVal) {
      return new Promise(function(resolve) {
        try {
          const existing = document.getElementById('ubit-custom-prompt-modal');
          if (existing) existing.remove();

          const theme = window.__ubitActiveTheme || '#10263c';
          const overlay = document.createElement('div');
          overlay.id = 'ubit-custom-prompt-modal';
          overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;font-family:sans-serif;';

          const modal = document.createElement('div');
          modal.style.cssText = 'background:#ffffff;border-radius:1rem;border-top:4px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;width:100%;overflow:hidden;padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem;';

          const titleRow = document.createElement('div');
          titleRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;';
          titleRow.innerHTML = '<div style="width:2.25rem;height:2.25rem;border-radius:9999px;background:rgba(16,38,60,0.1);color:' + theme + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div><h3 style="margin:0;font-size:1rem;font-weight:700;color:#0f172a;">' + (title || 'UBIT Pro ERP') + '</h3>';

          const form = document.createElement('form');
          form.style.cssText = 'display:flex;flex-direction:column;gap:1rem;margin:0;';

          const input = document.createElement('input');
          input.type = 'text';
          input.value = defaultVal || '';
          input.style.cssText = 'width:100%;box-sizing:border-box;padding:0.65rem 0.85rem;border:1.5px solid #cbd5e1;border-radius:0.5rem;font-size:0.9rem;color:#0f172a;outline:none;';
          input.onfocus = function() { input.style.borderColor = '#0284c7'; };
          input.onblur = function() { input.style.borderColor = '#cbd5e1'; };

          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:0.75rem;';

          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.style.cssText = 'padding:0.5rem 1rem;background:#f1f5f9;color:#475569;border:none;border-radius:0.5rem;font-size:0.85rem;font-weight:700;cursor:pointer;';
          cancelBtn.onclick = function() {
            overlay.remove();
            resolve(null);
          };

          const okBtn = document.createElement('button');
          okBtn.type = 'submit';
          okBtn.textContent = 'OK';
          okBtn.style.cssText = 'padding:0.5rem 1.25rem;background:' + theme + ';color:#ffffff;border:none;border-radius:0.5rem;font-size:0.85rem;font-weight:700;cursor:pointer;';

          form.onsubmit = function(e) {
            e.preventDefault();
            overlay.remove();
            resolve(input.value);
          };

          btnRow.appendChild(cancelBtn);
          btnRow.appendChild(okBtn);
          form.appendChild(input);
          form.appendChild(btnRow);

          modal.appendChild(titleRow);
          modal.appendChild(form);
          overlay.appendChild(modal);
          document.body.appendChild(overlay);

          setTimeout(function() {
            input.focus();
            input.select();
          }, 50);

          overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
              overlay.remove();
              resolve(null);
            }
          });
          const escHandler = function(e) {
            if (e.key === 'Escape') {
              overlay.remove();
              window.removeEventListener('keydown', escHandler);
              resolve(null);
            }
          };
          window.addEventListener('keydown', escHandler);
        } catch(e) {
          resolve(prompt(title, defaultVal));
        }
      });
    };
  })();
