package com.saagartraders.bcc;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/*
 * Incremental durable store for the synchronous JavaScript localStorage facade.
 *
 * The native database never receives plaintext business keys or values:
 * JavaScript sends a SHA-256 key id and a per-record AES-GCM envelope. Writes
 * are bounded and transactional, so changing one app key never exports or
 * rewrites the full multi-year database.
 */
@CapacitorPlugin(name = "SaagarNativeStore")
public class SaagarNativeStorePlugin extends Plugin {
    private static final int MAX_BATCH_OPS = 64;
    private static final int MAX_BATCH_BYTES = 16 * 1024 * 1024;
    private static final int DEFAULT_PAGE_ROWS = 32;
    private static final int MAX_PAGE_ROWS = 64;
    private static final int DEFAULT_PAGE_BYTES = 2 * 1024 * 1024;
    private static final int MAX_PAGE_BYTES = 8 * 1024 * 1024;
    private StoreDb helper;

    @Override
    public void load() {
        helper = new StoreDb(getContext());
        helper.setWriteAheadLoggingEnabled(true);
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            SQLiteDatabase db = db();
            JSObject out = new JSObject();
            out.put("available", true);
            out.put("schemaVersion", db.getVersion());
            out.put("rows", rowCount(db));
            out.put("migrated", "1".equals(meta(db, "migrated")));
            out.put("integrity", quickCheck(db));
            call.resolve(out);
        } catch (Throwable t) {
            call.reject("Native store status failed: " + safeMessage(t), "E_NATIVE_STATUS");
        }
    }

    @PluginMethod
    public void beginMigration(PluginCall call) {
        SQLiteDatabase db = db();
        db.beginTransaction();
        try {
            db.delete("kv_stage", null, null);
            putMeta(db, "expected_rows", "");
            db.setTransactionSuccessful();
            JSObject out = new JSObject();
            out.put("ready", true);
            call.resolve(out);
        } catch (Throwable t) {
            call.reject("Native migration could not start: " + safeMessage(t), "E_NATIVE_MIGRATION");
        } finally {
            db.endTransaction();
        }
    }

    @PluginMethod
    public void finishMigration(PluginCall call) {
        int expected = call.getInt("expectedRows", -1);
        if (expected < 0) {
            call.reject("Invalid expected row count", "E_ARGS");
            return;
        }
        SQLiteDatabase db = db();
        db.beginTransaction();
        try {
            long actual = rowCount(db, "kv_stage");
            if (actual != expected) {
                throw new IllegalStateException("row-count-mismatch:" + actual + "/" + expected);
            }
            if (!"ok".equals(quickCheck(db))) {
                throw new IllegalStateException("integrity-check-failed");
            }
            db.delete("kv", null, null);
            db.execSQL("INSERT INTO kv(key_id,payload,updated_seq) SELECT key_id,payload,updated_seq FROM kv_stage");
            if (rowCount(db) != expected) throw new IllegalStateException("publish-row-count-mismatch");
            db.delete("kv_stage", null, null);
            putMeta(db, "expected_rows", String.valueOf(expected));
            putMeta(db, "migrated", "1");
            db.setTransactionSuccessful();
            JSObject out = new JSObject();
            out.put("migrated", true);
            out.put("rows", actual);
            call.resolve(out);
        } catch (Throwable t) {
            call.reject("Native migration verification failed: " + safeMessage(t), "E_NATIVE_VERIFY");
        } finally {
            db.endTransaction();
        }
    }

    @PluginMethod
    public void readPage(PluginCall call) {
        String after = call.getString("afterKeyId", "");
        int limit = clamp(call.getInt("limit", DEFAULT_PAGE_ROWS), 1, MAX_PAGE_ROWS);
        int maxBytes = clamp(call.getInt("maxBytes", DEFAULT_PAGE_BYTES), 64 * 1024, MAX_PAGE_BYTES);
        SQLiteDatabase db = db();
        JSArray rows = new JSArray();
        String last = after;
        int used = 0;
        boolean hasMore = false;
        String sql = "SELECT key_id,payload,updated_seq FROM kv WHERE key_id>? ORDER BY key_id LIMIT ?";
        try (Cursor cursor = db.rawQuery(sql, new String[] { after, String.valueOf(limit + 1) })) {
            while (cursor.moveToNext()) {
                String id = cursor.getString(0);
                String payload = cursor.getString(1);
                int bytes = payload == null ? 0 : payload.getBytes(StandardCharsets.UTF_8).length;
                if (rows.length() >= limit || (rows.length() > 0 && used + bytes > maxBytes)) {
                    hasMore = true;
                    break;
                }
                JSObject row = new JSObject();
                row.put("keyId", id);
                row.put("payload", payload);
                row.put("seq", cursor.getLong(2));
                rows.put(row);
                last = id;
                used += bytes;
            }
            if (!hasMore && cursor.moveToNext()) hasMore = true;
        } catch (Throwable t) {
            call.reject("Native page read failed: " + safeMessage(t), "E_NATIVE_READ");
            return;
        }
        JSObject out = new JSObject();
        out.put("rows", rows);
        out.put("afterKeyId", last);
        out.put("done", !hasMore);
        out.put("bytes", used);
        call.resolve(out);
    }

    @PluginMethod
    public void applyBatch(PluginCall call) {
        JSArray input = call.getArray("ops");
        boolean clear = call.getBoolean("clear", false);
        boolean stage = call.getBoolean("stage", false);
        String table = stage ? "kv_stage" : "kv";
        if (input == null) input = new JSArray();
        JSONArray ops = input;
        if (ops.length() > MAX_BATCH_OPS) {
            call.reject("Native batch exceeds " + MAX_BATCH_OPS + " operations", "E_BATCH_LIMIT");
            return;
        }
        int bytes = 0;
        try {
            for (int i = 0; i < ops.length(); i++) {
                JSONObject op = ops.getJSONObject(i);
                bytes += utf8Length(op.optString("keyId", ""));
                bytes += utf8Length(op.optString("payload", ""));
            }
        } catch (Throwable t) {
            call.reject("Native batch is malformed", "E_ARGS");
            return;
        }
        if (bytes > MAX_BATCH_BYTES) {
            call.reject("Native batch exceeds byte limit", "E_BATCH_LIMIT");
            return;
        }

        SQLiteDatabase db = db();
        db.beginTransaction();
        int changed = 0;
        try {
            if (clear) db.delete(table, null, null);
            for (int i = 0; i < ops.length(); i++) {
                JSONObject op = ops.getJSONObject(i);
                String type = op.optString("type", "");
                String keyId = op.optString("keyId", "");
                long seq = op.optLong("seq", 0);
                if (!keyId.matches("[a-f0-9]{64}")) {
                    throw new IllegalArgumentException("invalid-key-id");
                }
                if ("remove".equals(type)) {
                    changed += db.delete(table, "key_id=?", new String[] { keyId });
                } else if ("set".equals(type)) {
                    String payload = op.optString("payload", "");
                    if (payload.isEmpty()) throw new IllegalArgumentException("empty-payload");
                    ContentValues values = new ContentValues();
                    values.put("key_id", keyId);
                    values.put("payload", payload);
                    values.put("updated_seq", seq);
                    db.insertWithOnConflict(table, null, values, SQLiteDatabase.CONFLICT_REPLACE);
                    changed++;
                } else {
                    throw new IllegalArgumentException("invalid-operation");
                }
            }
            db.setTransactionSuccessful();
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("changed", changed);
            out.put("rows", clear ? rowCount(db, table) : -1);
            call.resolve(out);
        } catch (Throwable t) {
            call.reject("Native batch failed: " + safeMessage(t), "E_NATIVE_WRITE");
        } finally {
            db.endTransaction();
        }
    }

    @PluginMethod
    public void reset(PluginCall call) {
        SQLiteDatabase db = db();
        db.beginTransaction();
        try {
            db.delete("kv", null, null);
            db.delete("kv_stage", null, null);
            db.delete("meta", null, null);
            db.setTransactionSuccessful();
            JSObject out = new JSObject();
            out.put("cleared", true);
            call.resolve(out);
        } catch (Throwable t) {
            call.reject("Native store reset failed: " + safeMessage(t), "E_NATIVE_RESET");
        } finally {
            db.endTransaction();
        }
    }

    private SQLiteDatabase db() {
        if (helper == null) {
            helper = new StoreDb(getContext());
            helper.setWriteAheadLoggingEnabled(true);
        }
        return helper.getWritableDatabase();
    }

    private long rowCount(SQLiteDatabase db) {
        return rowCount(db, "kv");
    }

    private long rowCount(SQLiteDatabase db, String table) {
        if (!("kv".equals(table) || "kv_stage".equals(table))) throw new IllegalArgumentException("invalid-table");
        try (Cursor cursor = db.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0;
        }
    }

    private String quickCheck(SQLiteDatabase db) {
        try (Cursor cursor = db.rawQuery("PRAGMA quick_check(1)", null)) {
            return cursor.moveToFirst() ? cursor.getString(0) : "missing";
        }
    }

    private String meta(SQLiteDatabase db, String key) {
        try (Cursor cursor = db.rawQuery("SELECT value FROM meta WHERE key=?", new String[] { key })) {
            return cursor.moveToFirst() ? cursor.getString(0) : "";
        }
    }

    private void putMeta(SQLiteDatabase db, String key, String value) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value);
        db.insertWithOnConflict("meta", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private int clamp(Integer value, int min, int max) {
        int number = value == null ? min : value;
        return Math.max(min, Math.min(max, number));
    }

    private int utf8Length(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }

    private String safeMessage(Throwable t) {
        String message = t == null ? "unknown" : t.getMessage();
        if (message == null || message.trim().isEmpty()) message = t.getClass().getSimpleName();
        return message.replaceAll("[\\p{Cntrl}]", " ").trim();
    }

    private static final class StoreDb extends SQLiteOpenHelper {
        private static final String NAME = "saagar-native-kv.db";
        private static final int VERSION = 2;

        StoreDb(Context context) {
            super(context, NAME, null, VERSION);
        }

        @Override
        public void onConfigure(SQLiteDatabase db) {
            super.onConfigure(db);
            db.setForeignKeyConstraintsEnabled(true);
            db.rawQuery("PRAGMA secure_delete=ON", null).close();
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE kv (key_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_seq INTEGER NOT NULL)");
            db.execSQL("CREATE TABLE kv_stage (key_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_seq INTEGER NOT NULL)");
            db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            if (oldVersion < 2) {
                db.execSQL("CREATE TABLE IF NOT EXISTS kv_stage (key_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_seq INTEGER NOT NULL)");
                return;
            }
            throw new IllegalStateException("Unsupported native store schema upgrade " + oldVersion + " -> " + newVersion);
        }
    }
}
