import express from "express";
import csv from "csv-parser";
import fs from "fs";
import path from "path";
import {Query} from "pg";
import {from} from "pg-copy-streams";
import { Readable } from "stream";
import { to as copyTo} from "pg-copy-streams"; 
import { pipeline } from "stream/promises"; 
import { PassThrough } from "stream";
import stripBomStream from "strip-bom-stream";
import { upload,storage,uploadDir,pool } from "../config.js"

export const Router= express.Router();

Router.post("/upload-payment", upload.single("file"), async (req, res) => {
    const filePath = req.file.path;
    const headerLine = parseInt(req.body.header);
    const skipLines = isNaN(headerLine) || headerLine < 1 ? 0 : headerLine - 1;

    const client = await pool.connect();
    let inserted = 0;
    let copyStream; 

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS records (
                id SERIAL PRIMARY KEY,
                source TEXT CHECK(source IN ('payments','settlements')),
                order_id TEXT,
                date TIMESTAMP,
                total_amount NUMERIC,
                raw_data JSONB
            );
        `);

        const buffer = new Readable({ read() {} });
        copyStream = client.query(from(`
            COPY records (source, order_id, date, total_amount, raw_data)
            FROM STDIN WITH (FORMAT csv)
        `));
        buffer.pipe(copyStream);

        const fileStream = fs.createReadStream(filePath).pipe(stripBomStream())
            .pipe(csv({ skipLines }));


        const previewRows = [];

        fileStream.on("data", (row) => {
            const orderId = row["order id"];
            const dateStr = row["date/time"];
            const total = parseFloat(row["total"] || "0");
            const date = dateStr ? new Date(dateStr) : null;

            if (!orderId || isNaN(total)) {
                console.warn("Skipped:", row);
                return;
            }

            const safeJson = JSON.stringify(row).replace(/"/g, '""');
            const line = `"payments","${orderId}","${date?.toISOString() || ""}","${total}","${safeJson}"\n`;
            buffer.push(line);
            inserted++;

            if (previewRows.length < 5) {
                previewRows.push(row);
            }
        });

        fileStream.on("end", () => {
            buffer.push(null);
            fs.unlinkSync(filePath);
        });

        fileStream.on("error", (err) => {
            console.error("CSV error:", err);
            if (!res.headersSent)
                res.status(500).send("CSV parsing failed.");
        });

        copyStream.on("finish", () => {
            if (!res.headersSent)
                res.json({ message: `Uploaded ${inserted} records.`, preview: previewRows });
        });

        copyStream.on("error", (err) => {
            console.error("COPY stream error:", err);
            if (!res.headersSent)
                res.status(500).json({ error: "COPY failed", details: err.message });
        });

    } catch (err) {
        console.error("Fatal error:", err);
        if (!res.headersSent)
            res.status(500).json({ error: "Upload failed", details: err.message });
    } finally {
        if (copyStream) {
            copyStream.on("end", () => client.release());
        } else {
            client.release();
        }
    }
});

Router.post("/upload-settlement", upload.single("file"), async (req, res) => {
    const filePath = req.file.path;
    const headerLine = parseInt(req.body.header);
    const skipLines = isNaN(headerLine) || headerLine < 1 ? 0 : headerLine - 1;
    let inserted = 0;
    const buffer = new Readable({ read() {} });
    let copyStream;

    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS records (
                id SERIAL PRIMARY KEY,
                source TEXT CHECK(source IN ('payments','settlements')),
                order_id TEXT,
                date TIMESTAMP,
                total_amount NUMERIC,
                raw_data JSONB
            );
        `);

        

        const copyStream = client.query(from(`
            COPY records (source, order_id, date, total_amount, raw_data)
            FROM STDIN WITH (FORMAT csv)`));


        buffer.pipe(copyStream);
        const previewRows = [];

        fs.createReadStream(filePath)
            .pipe(csv({ separator: "\t", skipLines }))
            .on("data", (row) => {
                const orderId = row["order-id"];
                const dateStr = row["posted-date-time"] || row["posted-date"];
                const total = parseFloat(row["amount"] || "0");
                const date = dateStr ? new Date(dateStr) : null;

                if (!orderId || isNaN(total)) {
                    console.warn("Skipped:", row);
                    return;
                }

                const safeJson = JSON.stringify(row)
                    .replace(/"/g, '""')
                    .replace(/\n/g, "\\n")
                    .replace(/\r/g, "\\r");

                const jsonField = `"${safeJson}"`; 
                const line = `"settlements","${orderId}","${date?.toISOString() || ""}","${total}",${jsonField}\n`;
                buffer.push(line);
                inserted++;

                if (previewRows.length < 5) {
                    previewRows.push(row);
                }

            })
            .on("end", () => {
                buffer.push(null);
                fs.unlinkSync(filePath);
            })
            .on("error", (err) => {
                console.error("CSV error:", err);
                res.status(500).send("CSV parsing failed.");
            });

        copyStream.on("finish", () => {
            res.json({ message: `Uploaded ${inserted} records.`,preview: previewRows});
        });

        copyStream.on("error", (err) => {
            console.error("COPY stream error:", err);
            res.status(500).json({ error: "COPY failed", details: err.message });
        });

    } catch (err) {
        console.error("Fatal error:", err);
        res.status(500).json({ error: "Upload failed", details: err.message });
    } finally {
        copyStream?.on("end", () => client.release());
    }
});

Router.get("/reconcile", async (req, res) => {
    const client = await pool.connect();
    let copyStream;

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS reconciled_records (
                id BIGSERIAL PRIMARY KEY,
                order_id TEXT NOT NULL,
                payment_ids BIGINT[],
                settlement_ids BIGINT[],
                payments_total NUMERIC,
                settlements_total NUMERIC,
                difference NUMERIC,
                status TEXT CHECK (status IN ('reconciled','unreconciled')) NOT NULL,
                reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const limit = parseInt(req.query.limit || "0");

        const reconciliationQuery = `
            SELECT
                COALESCE(p.order_id, s.order_id) AS order_id,
                p.payment_ids,
                s.settlement_ids,
                p.payments_total,
                s.settlements_total,
                CASE
                    WHEN p.payments_total IS NOT NULL AND s.settlements_total IS NOT NULL
                        THEN ROUND(p.payments_total - s.settlements_total, 2)
                    ELSE NULL
                END AS difference,
                CASE
                    WHEN p.payment_ids IS NULL OR s.settlement_ids IS NULL
                        THEN 'unreconciled'
                    ELSE 'reconciled'
                END AS status
            FROM (
                SELECT order_id, ARRAY_AGG(id) AS payment_ids, SUM(total_amount) AS payments_total
                FROM records
                WHERE source = 'payments'
                GROUP BY order_id
            ) p
            FULL OUTER JOIN (
                SELECT order_id, ARRAY_AGG(id) AS settlement_ids, SUM(total_amount) AS settlements_total
                FROM records
                WHERE source = 'settlements'
                GROUP BY order_id
            ) s ON p.order_id = s.order_id
            ${limit > 0 ? `LIMIT ${limit}` : ""}
        `;

        const result = await client.query(reconciliationQuery);
        const rows = result.rows;

        if (rows.length === 0) {
            res.json({ message: "No records to reconcile.", preview: [] });
            return;
        }

        const buffer = new Readable({ read() {} });

        copyStream = client.query(from(`
            COPY reconciled_records (
                order_id,
                payment_ids,
                settlement_ids,
                payments_total,
                settlements_total,
                difference,
                status
            ) FROM STDIN WITH (FORMAT csv, DELIMITER ',', NULL '', ESCAPE '\\')
        `));

        buffer.pipe(copyStream);

        const escapeCSV = (val) => `"${String(val).replace(/"/g, '""')}"`;
        const formatPgArray = (arr) => `{${arr.join(",")}}`;

        let inserted = 0;

        for (const r of rows) {
            const line = [
                escapeCSV(r.order_id),
                r.payment_ids ? escapeCSV(formatPgArray(r.payment_ids)) : "", 
                r.settlement_ids ? escapeCSV(formatPgArray(r.settlement_ids)) : "",
                r.payments_total ?? "",
                r.settlements_total ?? "",
                r.difference ?? "",
                escapeCSV(r.status)
            ].join(",") + "\n";

            buffer.push(line);
            inserted++;
        }

        buffer.push(null);

        copyStream.on("finish", () => {
            res.json({
                message: `Reconciled ${inserted} records.`,
                preview: rows.slice(0, 10)
            });
        });

        copyStream.on("error", (err) => {
            console.error("COPY stream error:", err);
            if (!res.headersSent) {
                res.status(500).json({
                    error: "COPY failed during reconciliation",
                    details: err.message
                });
            }
        });

    } catch (err) {
        console.error("Fatal error during reconciliation:", err);
        if (!res.headersSent) {
            res.status(500).json({
                error: "Reconciliation failed",
                details: err.message
            });
        }
    } finally {
        if (copyStream) {
            copyStream.on("end", () => client.release());
        } else {
            client.release();
        }
    }
});


Router.get("/export-report", async (req, res) => {
    const client = await pool.connect();

    try {
        const limit = parseInt(req.query.limit || "0");

        const query = `
            COPY (
                SELECT
                    order_id,
                    status,
                    payments_total,
                    settlements_total,
                    difference
                FROM reconciled_records
                ${limit > 0 ? `LIMIT ${limit}` : ""}
            )
            TO STDOUT WITH CSV HEADER
        `;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=report.csv");

        const stream = client.query(copyTo(query));
        stream.pipe(res);

        stream.on("end", () => {
            client.release();
        });

        stream.on("error", (err) => {
            console.error("COPY error:", err);
            if (!res.headersSent) {
                res.status(500).json({ error: "Export failed", details: err.message });
            }
            client.release();
        });

    } catch (err) {
        console.error("Fatal error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Export failed", details: err.message });
        }
        client.release();
    }
});