const TuyAPI = require('tuyapi');
const admin = require('hemligt');

// INITIALISERING
const serviceAccount = require('./config.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// HÄR DEFINIERAS REFERENSEN 
const heaterDocRef = db.collection('Enheter').doc('motorvarmare');

let isProcessing = false; 

console.log(" startad och redo!");

// --- FUNKTION FÖR ATT STYRA PLUGGEN ---
async function switchPlug(status) {
    if (isProcessing) return;
    isProcessing = true;

    const device = new TuyAPI({
        id: 'eget',
        ip: 'eget',
        key: `eget`,
        version: 'eget'
    });

    try {
        console.log(`\n--- Försöker slå ${status ? 'PÅ' : 'AV'} ---`);
        await device.find({timeout: 10}); 
        await device.connect();
        await device.set({ dps: 1, set: status });
        console.log("✅ KLART! Pluggen svarade.");
        await device.disconnect();
    } catch (err) {
        console.log("❌ Fel vid styrning:", err.message);
    } finally {
        isProcessing = false;
    }
}

// --- TIMER-LOOP (Körs 1 gång per minut) ---
setInterval(async () => {
    try {
        const doc = await heaterDocRef.get(); 
        if (!doc.exists) return;
        
        const data = doc.data();
        const nu = new Date();
        const nuTid = nu.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

        console.log(` Check: Tid ${nuTid} | Mål ${data.startTimer} | Aktiv: ${data.timerActive}`);

        if (data.timerActive && data.startTimer === nuTid) {
            console.log(` MATCH! Triggar värmare...`);
            
            // Slå på status i Firebase 
            await heaterDocRef.update({
                status: true,
                timerActive: false
            });

            // Automatisk avstängning efter 3 timmar
            setTimeout(async () => {
                console.log(" 3 timmar har gått, stänger av.");
                await heaterDocRef.update({ status: false });
            }, 3 * 60 * 60 * 1000);
        }
    } catch (err) {
        console.error(" Fel i timer-loopen:", err.message);
    }
}, 60000);

// --- REALTIDSLYSSNARE ---
heaterDocRef.onSnapshot(doc => {
    if (doc.exists) {
        const status = doc.data().status;
       //fördröjning styrning för att inte få krock.
        setTimeout(() => switchPlug(status), 500); 
    }
});
