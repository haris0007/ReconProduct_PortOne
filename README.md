# 📦 PortOne Reconciliation API

This is a high-performance CSV reconciliation server built with **Node.js**, **Express**, and **PostgreSQL**. It supports uploading large CSV/TSV datasets (Payments and Settlements), stores them efficiently using **COPY streams**, provides data sample after ingestion in response(preview), reconciles them by matching `order_id`s, and allows exporting the result as a CSV.

---

## 🚀 Features

- Upload CSV (Payments) or TSV (Settlements) files
- Efficient parsing using `csv-parser` + `pg-copy-streams`
- Preview of first 5 records in upload response
- Reconciles payments and settlements by `order_id`
- Outputs reconciliation summary
- Exports the final report directly as downloadable CSV

---

## 🏗️ PostgreSQL Schema

Two tables are auto-created:

### 1. `records`

Stores raw uploads.

```sql
CREATE TABLE IF NOT EXISTS records (
    id SERIAL PRIMARY KEY,
    source TEXT CHECK(source IN ('payments','settlements')),
    order_id TEXT,
    date TIMESTAMP,
    total_amount NUMERIC,
    raw_data JSONB
);
```

### 2. `reconciled_record`

Stores matched payment-settlement pairs.

```sql
CREATE TABLE IF NOT EXISTS reconciled_record (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL,
    payment_ids BIGINT[],
    settlement_ids BIGINT[],
    payment_total NUMERIC,
    settlement_total NUMERIC,
    amount_difference NUMERIC,
    status TEXT CHECK (status IN ('reconciled','unreconciled')) NOT NULL,
    reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📦 API Endpoints

### 📤 POST `/upload-payment`

Uploads a **Payments CSV** file.

- **Headers:**  
  - `Content-Type: multipart/form-data`
- **Form Data Fields:**  
  - `file`: the `.csv` file with fields like `order id`, `date/time`, `total`
  - `header`: the line number where headers are present (e.g. `1`)

- **Sample Fields in CSV:**
```csv
order id,date/time,total
ORD001,2024-07-01T10:30:00,1500
```

- **Response:**
```json
{
  "message": "Uploaded 120 records.",
  "preview": [
    {
      "order id": "ORD001",
      "date/time": "2024-07-01T10:30:00",
      "total": "1500"
    }
  ]
}
```

---

### 📥 POST `/upload-settlement`

Uploads a **Settlement TSV** file.

- **Headers:**  
  - `Content-Type: multipart/form-data`
- **Form Data Fields:**  
  - `file`: the `.tsv` file with fields like `order-id`, `posted-date`, `amount`
  - `header`: the line number where headers are present (e.g. `1`)

- **Sample Fields in TSV:**
```tsv
order-id	posted-date	amount
ORD001	2024-07-02	1500
```

- **Response:**
```json
{
  "message": "Uploaded 100 records.",
  "preview": [
    {
      "order-id": "ORD001",
      "posted-date": "2024-07-02",
      "amount": "1500"
    }
  ]
}
```

---

### 🔄 GET `/reconcile?limit=10`

Reconciles payment and settlement records based on `order_id`.

- **Optional Query Param:**
  - `limit`: number of records to reconcile (default: all)

- **Logic:**
  - Joins payments and settlements by `order_id`
  - Calculates `payment_total`, `settlement_total`, and `amount_difference`
  - Marks records as `reconciled` or `unreconciled`

- **Response:**
```json
{
  "message": "Reconciled 10 records.",
  "preview": [
    {
      "order_id": "ORD001",
      "payment_ids": [1],
      "settlement_ids": [2],
      "payment_total": 1500,
      "settlement_total": 1500,
      "amount_difference": 0,
      "status": "reconciled"
    }
  ]
}
```

---

### 📥 GET `/export-report?limit=50`

Downloads a **CSV report** of reconciled records.

- Paste this in your browser:
```
http://localhost:3000/export-report
```

- **Optional Query Param:**
  - `limit`: number of rows to export

- **CSV Fields:**
```csv
order_id,status,payment_total,settlement_total,amount_difference
ORD001,reconciled,1500,1500,0
ORD002,unreconciled,2000,, 
```

---

## ⚙️ .env Configuration

Create a `.env` file in the project root with the following:

```
PORT=3000
UN=your_postgres_username
DB=your_database_name
PWD=your_secure_password
```

> ⚠️ **Keep this file private**. Never commit `.env` to version control.


## 🧪 Test Uploads Easily

Use **Postman** or **cURL** for testing uploads.

**Sample cURL for payments:**
```bash
curl -X POST http://localhost:3000/upload-payment \
  -F "file=@/path/to/payments.csv" \
  -F "header=1"
```

---

## ⚡ Optimizations for Large Data

- **Streaming ingestion:** No file fully loaded into memory.
- **COPY FROM STDIN:** Uses PostgreSQL’s fastest bulk insert method.
- **Preview Limiting:** Only returns first 5 rows for preview, not full data.
- **Buffered Input:** Uses `Readable` stream piped into PostgreSQL COPY stream.

---

## 📁 Folder Structure

```
├── index.js                // Main server file
├── config.js               // PostgreSQL + Multer setup
├── routes/
│   └── routes.js           // All API routes
├── uploads/                // Uploaded files (auto-created)
├── .env                    // Environment variables
├── package.json
```

---

## 🧠 Troubleshooting

- **Ensure PostgreSQL is running**
- **.env must be present**
- **Header names must match expected field names**
  - Payments: `order id`, `date/time`, `total`
  - Settlements: `order-id`, `posted-date` or `posted-date-time`, `amount`

---

## 👨‍💻 Author

**Hariskumar S.**

MIT License
