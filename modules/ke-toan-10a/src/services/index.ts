import type { Database } from "../lib/db.js";
import { AccountsService } from "./accounts.service.js";
import { ContactsService } from "./contacts.service.js";
import { LedgerService } from "./ledger.service.js";
import { ReceiptsService } from "./receipts.service.js";
import { PaymentsService } from "./payments.service.js";
import { InvoicesService } from "./invoices.service.js";
import { BillsService } from "./bills.service.js";
import { FiscalService } from "./fiscal.service.js";
import { ReportsService } from "./reports.service.js";
import { ExcelService } from "./excel.service.js";
import { ClosingService } from "./closing.service.js";
import { VietnamService } from "./vietnam.service.js";
import { AdvancesService } from "./advances.service.js";
import { RecurringService } from "./recurring.service.js";
import { ImportService } from "./import.service.js";
import { DimensionsService } from "./dimensions.service.js";
import { BankService } from "./bank.service.js";
import { AssetsService } from "./assets.service.js";
import { BudgetService } from "./budget.service.js";
import { FxService } from "./fx.service.js";

/**
 * KetoanServices — điểm truy cập duy nhất tới toàn bộ nghiệp vụ Kế Toán 10A.
 * Routes và Tiểu Tâm actions/tools đều dùng facade này.
 */
export class KetoanServices {
  readonly accounts: AccountsService;
  readonly contacts: ContactsService;
  readonly ledger: LedgerService;
  readonly receipts: ReceiptsService;
  readonly payments: PaymentsService;
  readonly invoices: InvoicesService;
  readonly bills: BillsService;
  readonly fiscal: FiscalService;
  readonly reports: ReportsService;
  readonly excel: ExcelService;
  readonly closing: ClosingService;
  readonly vietnam: VietnamService;
  readonly advances: AdvancesService;
  readonly recurring: RecurringService;
  readonly imports: ImportService;
  readonly dimensions: DimensionsService;
  readonly bank: BankService;
  readonly assets: AssetsService;
  readonly budget: BudgetService;
  readonly fx: FxService;

  constructor(db: Database) {
    this.accounts = new AccountsService(db);
    this.contacts = new ContactsService(db);
    this.ledger = new LedgerService(db);
    this.receipts = new ReceiptsService(db);
    this.payments = new PaymentsService(db);
    this.invoices = new InvoicesService(db);
    this.bills = new BillsService(db);
    this.fiscal = new FiscalService(db);
    this.reports = new ReportsService(db);
    this.excel = new ExcelService(db);
    this.closing = new ClosingService(db);
    this.vietnam = new VietnamService(db);
    this.advances = new AdvancesService(db);
    this.recurring = new RecurringService(db);
    this.imports = new ImportService(db);
    this.dimensions = new DimensionsService(db);
    this.bank = new BankService(db);
    this.assets = new AssetsService(db);
    this.budget = new BudgetService(db);
    this.fx = new FxService(db);
  }
}

export {
  AccountsService,
  ContactsService,
  LedgerService,
  ReceiptsService,
  PaymentsService,
  InvoicesService,
  BillsService,
  FiscalService,
  ReportsService,
  ExcelService,
  ClosingService,
  VietnamService,
  AdvancesService,
  RecurringService,
  ImportService,
  DimensionsService,
  BankService,
  AssetsService,
  BudgetService,
  FxService,
};
