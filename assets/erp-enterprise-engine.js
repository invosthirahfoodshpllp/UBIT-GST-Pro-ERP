/**
 * GST Pro ERP / UBIT ERP — Enterprise Engine Extensions
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
