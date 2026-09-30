const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

(async () => {
  const n = (await db.doc("notice/current").get()).data();
  if (!n || !n.active || !n.title) { console.log("কোনো চালু নোটিশ নেই"); return; }

  const meta = db.doc("meta/lastNotice");
  const last = (await meta.get()).data();
  const key = String(n.ts || "") + "|" + n.title;
  if (last && last.key === key) { console.log("এই নোটিশ আগেই পাঠানো হয়েছে"); return; }

  const tokens = (await db.collection("fcmTokens").get()).docs.map((d) => d.id);
  console.log("মোট ডিভাইস:", tokens.length);

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const r = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      data: { title: n.title, image: n.image || "", ts: String(n.ts || ""), url: "./" },
      webpush: { headers: { Urgency: "high", TTL: "86400" } },
    });
    console.log("সফল:", r.successCount, "ব্যর্থ:", r.failureCount);
    const bad = [];
    r.responses.forEach((x, j) => {
      const c = (x.error && x.error.code) || "";
      if (!x.success && /not-registered|invalid-registration|invalid-argument/.test(c)) bad.push(chunk[j]);
    });
    await Promise.all(bad.map((t) => db.collection("fcmTokens").doc(t).delete()));
  }
  await meta.set({ key, sentAt: Date.now() });
})().catch((e) => { console.error(e); process.exit(1); });
