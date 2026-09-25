// @ts-strict-ignore
import { expectSnapshotWithDiffer } from '#mocks/util';
import * as db from '#server/db';

import * as transfer from './transfer';

beforeEach(global.emptyDatabase());

function getAllTransactions() {
  return db.all<db.DbViewTransaction & { payee_name: db.DbPayee['name'] }>(
    `SELECT t.*, p.name as payee_name
       FROM v_transactions t
       LEFT JOIN payees p ON p.id = t.payee
       ORDER BY date DESC, amount DESC, id
     `,
  );
}

async function prepareDatabase() {
  await db.insertCategoryGroup({ id: 'group1', name: 'group1', is_income: 0 });
  await db.insertCategory({
    id: '1',
    name: 'cat1',
    cat_group: 'group1',
    is_income: 0,
  });
  await db.insertAccount({ id: 'one', name: 'one' });
  await db.insertAccount({ id: 'two', name: 'two' });
  await db.insertAccount({ id: 'three', name: 'three', offbudget: 1 });
  await db.insertPayee({ name: '', transfer_acct: 'one' });
  await db.insertPayee({ name: '', transfer_acct: 'two' });
  await db.insertPayee({
    name: '',
    transfer_acct: 'three',
  });
}

type Transaction = {
  account: string;
  amount: number;
  category?: string;
  date: string;
  id?: string;
  notes?: string;
  payee: string;
  transfer_id?: string;
  is_parent?: boolean;
  is_child?: boolean;
  parent_id?: string;
};

describe('Transfer', () => {
  test('transfers are properly inserted/updated/deleted', async () => {
    await prepareDatabase();

    let transaction: Transaction = {
      account: 'one',
      amount: 5000,
      payee: await db.insertPayee({ name: 'Non-transfer' }),
      date: '2017-01-01',
    };
    await db.insertTransaction(transaction);
    await transfer.onInsert(transaction);

    const differ = expectSnapshotWithDiffer(await getAllTransactions());

    const transferTwo = await db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'two'",
    );
    const transferThree = await db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'three'",
    );

    transaction = {
      account: 'one',
      amount: 5000,
      payee: transferTwo.id,
      date: '2017-01-01',
    };
    transaction.id = await db.insertTransaction(transaction);
    await transfer.onInsert(transaction);
    differ.expectToMatchDiff(await getAllTransactions());

    // Fill the transaction out
    transaction = await db.getTransaction(transaction.id);
    expect(transaction.transfer_id).toBeDefined();

    transaction = {
      ...transaction,
      date: '2017-01-05',
      notes: 'This is a note',
    };
    await db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(await getAllTransactions());

    transaction = {
      ...transaction,
      payee: transferThree.id,
    };
    await db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(await getAllTransactions());

    transaction = {
      ...transaction,
      payee: await db.insertPayee({ name: 'Not transferred anymore' }),
    };
    await db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(await getAllTransactions());

    // Make sure it's not a linked transaction anymore
    transaction = await db.getTransaction(transaction.id);
    expect(transaction.transfer_id).toBeNull();

    // Re-transfer it
    transaction = {
      ...transaction,
      payee: transferTwo.id,
    };
    await db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(await getAllTransactions());

    transaction = await db.getTransaction(transaction.id);
    expect(transaction.transfer_id).toBeDefined();

    await db.deleteTransaction(transaction);
    await transfer.onDelete(transaction);
    differ.expectToMatchDiff(await getAllTransactions());
  });

  test('transfers are properly de-categorized', async () => {
    await prepareDatabase();

    const transferTwo = await db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'two'",
    );
    const transferThree = await db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'three'",
    );

    let transaction: Transaction = {
      account: 'one',
      amount: 5000,
      payee: await db.insertPayee({ name: 'Non-transfer' }),
      date: '2017-01-01',
      category: '1',
    };
    transaction.id = await db.insertTransaction(transaction);
    await transfer.onInsert(transaction);

    const differ = expectSnapshotWithDiffer(await getAllTransactions());

    transaction = {
      ...(await db.getTransaction(transaction.id)),
      payee: transferThree.id,
      notes: 'hi',
    };
    await db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(await getAllTransactions());

    transaction = {
      ...(await db.getTransaction(transaction.id)),
      payee: transferTwo.id,
    };
    await db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(await getAllTransactions());
  });

  test('split transfers are retained on child transactions', async () => {
    // test: first add a txn having a transfer acct payee
    // then mark it as `is_parent` and add a child txn
    // the child txn should have a different transfer acct payee
    // and `is_child` set to true
    await prepareDatabase();

    const [transferOne, transferTwo] = await Promise.all([
      db.first<db.DbPayee>("SELECT * FROM payees WHERE transfer_acct = 'one'"),
      db.first<db.DbPayee>("SELECT * FROM payees WHERE transfer_acct = 'two'"),
    ]);

    let parent: Transaction = {
      account: 'one',
      amount: 5000,
      payee: transferTwo.id,
      date: '2017-01-01',
    };
    parent.id = await db.insertTransaction(parent);
    await transfer.onInsert(parent);
    parent = await db.getTransaction(parent.id);

    const differ = expectSnapshotWithDiffer(await getAllTransactions());

    // mark the txn as parent
    await db.updateTransaction({ id: parent.id, is_parent: true });
    await transfer.onUpdate(parent);
    differ.expectToMatchDiff(await getAllTransactions());

    // add a child txn
    let child: Transaction = {
      account: 'one',
      amount: 2000,
      payee: transferOne.id,
      date: '2017-01-01',
      is_child: true,
      parent_id: parent.id,
    };
    child.id = await db.insertTransaction(child);
    await transfer.onInsert(child);
    differ.expectToMatchDiff(await getAllTransactions());

    // ensure that the child txn has the correct transfer acct payee
    child = await db.getTransaction(child.id);
    expect(child.transfer_id).not.toBe(parent.transfer_id);
    expect(child.payee).toBe(transferOne.id);
  });

  test('addTransfer links to an existing unlinked transaction on the target account instead of duplicating it', async () => {
    await prepareDatabase();

    const transferTwo = await db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'two'",
    );

    // Simulate account "two" already having its own independently-synced
    // transaction for this transfer (e.g. bank sync imported both sides
    // separately, before either side's payee got rule-mapped to a transfer
    // payee).
    const existingId = await db.insertTransaction({
      account: 'two',
      amount: -5000,
      payee: await db.insertPayee({ name: 'Some Bank Description' }),
      date: '2017-01-02',
    });

    const transaction: Transaction = {
      account: 'one',
      amount: 5000,
      payee: transferTwo.id,
      date: '2017-01-01',
    };
    transaction.id = await db.insertTransaction(transaction);
    await transfer.onInsert(transaction);

    // Should have linked to the existing transaction rather than inserting
    // a new (duplicate) leg.
    const allTransactions = await getAllTransactions();
    expect(allTransactions).toHaveLength(2);

    const updatedOriginal = await db.getTransaction(transaction.id);
    const updatedExisting = await db.getTransaction(existingId);
    expect(updatedOriginal.transfer_id).toBe(existingId);
    expect(updatedExisting.transfer_id).toBe(transaction.id);
    expect(updatedExisting.payee).toBe(
      (
        await db.first<db.DbPayee>(
          "SELECT * FROM payees WHERE transfer_acct = 'one'",
        )
      ).id,
    );
  });

  test('addTransfer inserts a new leg when no existing candidate transaction is found', async () => {
    await prepareDatabase();

    const transferTwo = await db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'two'",
    );

    const transaction: Transaction = {
      account: 'one',
      amount: 5000,
      payee: transferTwo.id,
      date: '2017-01-01',
    };
    transaction.id = await db.insertTransaction(transaction);
    await transfer.onInsert(transaction);

    const allTransactions = await getAllTransactions();
    expect(allTransactions).toHaveLength(2);

    const updatedOriginal = await db.getTransaction(transaction.id);
    expect(updatedOriginal.transfer_id).toBeDefined();
    const otherLeg = await db.getTransaction(updatedOriginal.transfer_id);
    expect(otherLeg.account).toBe('two');
    expect(otherLeg.amount).toBe(-5000);
  });
  // Regression tests for a weekly $50 on-budget -> off-budget transfer
  // (checking "one" -> brokerage "three"), where last week's checking leg was
  // left unlinked. The lookup used to take the oldest candidate in a +/-7 day
  // window, so each week's brokerage deposit linked to the previous week's
  // checking withdrawal.
  describe('weekly repeating transfer', () => {
    async function insertCheckingLeg(date: string) {
      return db.insertTransaction({
        account: 'one',
        amount: -5000,
        payee: await db.insertPayee({ name: 'Vanguard' }),
        date,
      });
    }

    async function insertBrokerageDeposit(date: string) {
      const transferOne = await db.first<db.DbPayee>(
        "SELECT * FROM payees WHERE transfer_acct = 'one'",
      );
      const transaction: Transaction = {
        account: 'three',
        amount: 5000,
        payee: transferOne.id,
        date,
      };
      transaction.id = await db.insertTransaction(transaction);
      await transfer.onInsert(transaction);
      return db.getTransaction(transaction.id);
    }

    test("links to this week's leg, not last week's unlinked leftover", async () => {
      await prepareDatabase();
      const lastWeek = await insertCheckingLeg('2026-09-16');
      const thisWeek = await insertCheckingLeg('2026-09-23');

      const deposit = await insertBrokerageDeposit('2026-09-23');

      expect(deposit.transfer_id).toBe(thisWeek);
      expect((await db.getTransaction(lastWeek)).transfer_id).toBeNull();
    });

    test("does not link to last week's leftover before this week's leg exists", async () => {
      await prepareDatabase();
      const lastWeek = await insertCheckingLeg('2026-09-16');

      const deposit = await insertBrokerageDeposit('2026-09-23');

      expect(deposit.transfer_id).not.toBe(lastWeek);
      expect((await db.getTransaction(lastWeek)).transfer_id).toBeNull();
      const newLeg = await db.getTransaction(deposit.transfer_id);
      expect(newLeg.account).toBe('one');
      expect(newLeg.date).toBe('2026-09-23');
    });

    test('prefers the closest-dated candidate when several are in range', async () => {
      await prepareDatabase();
      await insertCheckingLeg('2026-09-21');
      const closer = await insertCheckingLeg('2026-09-24');

      const deposit = await insertBrokerageDeposit('2026-09-23');

      expect(deposit.transfer_id).toBe(closer);
    });
  });
});
