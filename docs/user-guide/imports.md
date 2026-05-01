# Importing Data

One of the most powerful features of MondayMoney is its ability to import transactions from various CSV formats provided by banks.

## Supported Formats

We currently have built-in support for:
- **Nubank:** Standard credit card and account statements.
- **Binance:** Transaction, deposit, and withdraw history.
- **Generic CSV:** A flexible format for other sources.

## How to Import

1. Navigate to the **Import** page in the application.
2. Select the source of your CSV (e.g., "Nubank").
3. Drag and drop your CSV file into the designated area or click to browse.
4. Review the detected transactions.
5. Click **Confirm Import** to add them to your ledger.

## Custom Mappings

If your bank is not supported, you can use the Generic CSV importer. You will need to map your CSV columns to MondayMoney's expected fields:
- Date
- Description
- Amount
- Category (Optional)

!!! tip
    If you have a format that is not supported and would like us to add it, please open an issue on GitHub with a sample (and redacted) CSV file.
