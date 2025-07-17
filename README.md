# 🪙 PortOne Reconciliation API
This is a high-performance CSV reconciliation server built with **Node.js**, **Express**, and **PostgreSQL**. It supports uploading large CSV/TSV datasets (Payments and Settlements), stores them efficiently using **COPY streams**, provides data sample after ingestion (preview), reconciles them by matching `order_id`s, and allows exporting the result as a downloadable CSV.

---

## 🔗 API Endpoints

| Method | Endpoint              | Description                            |
|--------|------------------------|----------------------------------------|
| POST   | `/upload-payment`      | Upload a payments CSV file             |
| POST   | `/upload-settlement`   | Upload a settlements TSV file          |
| GET    | `/reconcile?limit=n`   | Reconcile records based on order_id    |
| GET    | `/export-report?limit=n` | Export the reconciled CSV report     |

---

## 🚀 Features
- Upload CSV (Payments) or TSV (Settlements) files  
- Efficient parsing using `csv-parser` + `pg-copy-streams`  
- Preview of first 5 records after upload  
- Reconciles payments and settlements by `order_id`  
- Outputs reconciliation summary  
- Exports the final report directly as downloadable CSV

---

## 📥 Clone the Repository
```bash
git clone https://github.com/haris0007/ReconProduct_PortOne.git
cd ReconProduct_PortOne
```

---

## 📦 Installation
```bash
npm install
```
Ensure PostgreSQL is running and a `.env` file is configured with the following:
```
PORT=3000
UN=your_postgres_username
DB=your_database_name
PWD=your_secure_password
```
> ⚠️ **Do not share your `.env` values publicly.** This file must remain private.

---

## ▶️ Run the Server
```bash
npm run dev
```

---

## 🛠 Schema Definitions

### Table: `records`
Stores all uploaded payment and settlement entries.
| Column         | Type      | Description                                   |
|----------------|-----------|-----------------------------------------------|
| `id`           | SERIAL    | Primary key                                   |
| `source`       | TEXT      | `'payments'` or `'settlements'`               |
| `order_id`     | TEXT      | Unique order ID                               |
| `date`         | TIMESTAMP | Date/time of transaction                      |
| `total_amount` | NUMERIC   | Total amount                                  |
| `raw_data`     | JSONB     | Full original row stored for reference        |

---

### Table: `reconciled_records`
Stores reconciliation results.
| Column             | Type        | Description                                 |
|--------------------|-------------|---------------------------------------------|
| `id`               | BIGSERIAL   | Primary key                                 |
| `order_id`         | TEXT        | Unique order ID                             |
| `payment_ids`      | BIGINT[]    | Matched payment record IDs                  |
| `settlement_ids`   | BIGINT[]    | Matched settlement record IDs               |
| `payments_total`    | NUMERIC     | Total payment amount                        |
| `settlements_total` | NUMERIC     | Total settlement amount                     |
| `difference`       | NUMERIC     | Difference between payment and settlement   |
| `status`           | TEXT        | `'reconciled'` or `'unreconciled'`         |
| `reconciled_at`    | TIMESTAMPTZ | Timestamp of reconciliation                 |

---

## 📦 API Endpoints

### 📤 POST `/upload-payment`
Upload a **CSV file** for Payments.
- **Headers:**  
  - `Content-Type: multipart/form-data`  
- **Form Fields:**  
  - `file`: the CSV file  
  - `header`: row number where headers are located (e.g. `1`)  

**✅ Expected CSV Header Format:**
```csv
date/time,settlement id,type,order id,sku,description,quantity,marketplace,account type,fulfillment,tax collection model,product sales,product sales tax,shipping credits,shipping credits tax,gift wrap credits,giftwrap credits tax,Regulatory Fee,Tax On Regulatory Fee,promotional rebates,promotional rebates tax,marketplace withheld tax,selling fees,fba fees,other transaction fees,other,total
```

**✅ Sample Entry:**
```csv
Jun 8, 2025 10:23:05 PM PDT,18174059732,Order,1211455071067537800,13Z2Q8JWG710,,1,amazon.com,Standard Orders,Amazon,MarketplaceFacilitator,14.9,1.04,0,0,0,0,0,0,0,0,-1.04,-2.24,-4.85,0,0,7.81
```

**🔁 Response:**
```json
{
  "message": "Uploaded 120 records.",
  "preview": [
      ...first 5 rows...
  ]
}
```

---

### 📥 POST `/upload-settlement`
Upload a **TSV file** for Settlements.
- **Headers:**  
  - `Content-Type: multipart/form-data`  
- **Form Fields:**  
  - `file`: the TSV file  
  - `header`: row number where headers are located (e.g. `1`)  

**✅ Expected TSV Header Format:**
```tsv
settlement-id	settlement-start-date	settlement-end-date	deposit-date	total-amount	currency	transaction-type	order-id	merchant-order-id	adjustment-id	shipment-id	marketplace-name	amount-type	amount-description	amount	fulfillment-id	posted-date	posted-date-time	order-item-code	merchant-order-item-id	merchant-adjustment-item-id	sku	quantity-purchased
```

**✅ Sample Entry:**
```tsv
18174059732		...		...	...	...	Order	1211397397571528200	1211397397571528200		BfBHMJD7G	Amazon.com	ItemPrice	Principal	14.9	AFN	09/06/25	2025-06-09 05:23:19 UTC		...	...	13Z2Q8JWG710	1
```

**🔁 Response:**
```json
{
  "message": "Uploaded 100 records.",
  "preview": [
        ...first 5 rows...
  ]
}
```

---

### 🔄 GET `/reconcile?limit=10`
Triggers reconciliation between Payments and Settlements based on `order_id`.
- **Optional Query Param:**
  - `limit`: number of records to process (optional)

**🔁 Response:**
```json
{
  "message": "Reconciled 10 records.",
  "preview": [
    {
      "order_id": "1211397397571528200",
      "payment_ids": [1],
      "settlement_ids": [2],
      "payments_total": 14.9,
      "settlements_total": 14.9,
      "difference": 0,
      "status": "reconciled"
    },
    ...first 10 rows...
  ]
}
```

---

### 📤 GET `/export-report?limit=50`
Exports reconciliation report as a downloadable CSV.  
🧾 Just paste this URL in the browser:
```
http://localhost:3000/export-report
```
- **Optional Query Param:**
  - `limit`: number of records to include

**Sample CSV Output:**
```csv
order_id,status,payments_total,settlements_total,difference
1211397397571528200,reconciled,14.9,14.9,0
1211455071067537800,unreconciled,7.81,, 
```

---

## ⚡ Optimizations for Large Data
- Uses **COPY FROM STDIN** for bulk inserts (faster than batch inserts)  
- **Readable Stream Buffers** used to avoid memory overflow  
- Only **first 5 rows** returned as preview (rest handled silently)  
- File is **deleted** after successful parsing to save space

---

## 🧪 Test Uploads Easily
You can test endpoints with **Postman**, **Thunder Client**, or cURL.
```bash
curl -X POST http://localhost:3000/upload-payment \
  -F "file=@/full/path/to/payment.csv" \
  -F "header=1"
```

---

## 📁 Folder Structure
```
├── index.js                // Main server file
├── config.js               // DB + file upload config
├── routes/
│   └── routes.js           // All route handlers
├── uploads/                // Temp uploaded files
├── .env                    // Environment config
├── package.json
```

---

## 👨‍💻 Author
**Hariskumar S.**  
MIT License
