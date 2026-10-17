import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
  import { getDatabase, ref, set, get, onValue, remove } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";
  import { getStorage, ref as sRef, uploadBytes, getDownloadURL, getBytes, getBlob, listAll, getMetadata, deleteObject } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-storage.js";
  import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

  const firebaseConfig = {
    apiKey: "AIzaSyBb3VxLsd-T-aMnEmhT7eBO9hPeQBbZqvQ",
    authDomain: "mbcscilab-ff131.firebaseapp.com",
    projectId: "mbcscilab-ff131",
    databaseURL: "https://mbcscilab-ff131-default-rtdb.firebaseio.com",
    storageBucket: "mbcscilab-ff131.firebasestorage.app",
    messagingSenderId: "324977891269",
    appId: "1:324977891269:web:70f4f958cf69182d1e5dac"
  };

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const storage = getStorage(app);
  const auth = getAuth(app);
  let _anonAuthPromise = null;

  async function ensureFirebaseAuth() {
    if (auth.currentUser) return auth.currentUser;
    if (!_anonAuthPromise) {
      _anonAuthPromise = signInAnonymously(auth).catch(err => {
        _anonAuthPromise = null;
        throw err;
      });
    }
    await _anonAuthPromise;
    return auth.currentUser;
  }

  function isFirebaseDownloadUrl(url) {
    return /firebasestorage\.googleapis\.com|firebasestorage\.app/i.test(String(url || ''));
  }

  function httpDownloadArrayBuffer(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
        else reject(new Error(`HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Failed to fetch'));
      xhr.send();
    });
  }

  function sanitizeProcedureForCloud(item) {
    const files = (item.files || []).map(f => {
      const entry = {
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
        uploadedAt: f.uploadedAt || ''
      };
      if (f.url) entry.url = f.url;
      if (f.storagePath) entry.storagePath = f.storagePath;
      return entry;
    });
    return {
      id: item.id,
      title: item.title,
      subject: item.subject,
      grade: item.grade,
      labRoom: item.labRoom,
      equipment: item.equipment || [],
      reagents: item.reagents || [],
      steps: item.steps || [],
      notes: item.notes || '',
      uploadedAt: item.uploadedAt || '',
      files,
      lastUpdated: new Date().toISOString()
    };
  }

  function sanitizeInventoryForCloud(item) {
    const msds = (item.msds || []).map(f => {
      const entry = {
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
        uploadedAt: f.uploadedAt || ''
      };
      if (f.url) entry.url = f.url;
      else if (f.dataBase64) entry.dataBase64 = f.dataBase64;
      return entry;
    });
    const photos = (item.photos || []).map(f => {
      const entry = {
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
        uploadedAt: f.uploadedAt || ''
      };
      if (f.url) entry.url = f.url;
      else if (f.dataBase64) entry.dataBase64 = f.dataBase64;
      return entry;
    });
    return {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn || '',
      nameZh: item.nameZh || '',
      formula: item.formula || '—',
      category: item.category,
      quantity: item.quantity,
      stockQuantity: item.stockQuantity || '',
      location: item.location,
      hazards: item.hazards,
      msds,
      photos,
      lastUpdated: new Date().toISOString()
    };
  }

  async function uploadFile(file, folderPath) {
    if (!file) return null;
    try {
      const timestamp = Date.now();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${folderPath}/${timestamp}_${cleanFileName}`;
      const fileRef = sRef(storage, storagePath);
      const snapshot = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(snapshot.ref);
      return { url, storagePath };
    } catch (error) {
      console.error(`Firebase Storage upload failed (${folderPath}):`, error);
      throw error;
    }
  }

  async function uploadBlob(blob, folderPath, fileName) {
    if (!blob) return null;
    try {
      const timestamp = Date.now();
      const cleanFileName = String(fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${folderPath}/${timestamp}_${cleanFileName}`;
      const fileRef = sRef(storage, storagePath);
      const snapshot = await uploadBytes(fileRef, blob);
      const url = await getDownloadURL(snapshot.ref);
      return { url, storagePath };
    } catch (error) {
      console.error(`Firebase Storage upload failed (${folderPath}):`, error);
      throw error;
    }
  }

  function parseStoragePathFromDownloadUrl(url) {
    if (!url) return null;
    try {
      const match = String(url).match(/\/o\/([^?]+)/);
      if (match) return decodeURIComponent(match[1]);
    } catch (_) {}
    return null;
  }

  async function downloadFileBytes(downloadUrl, storagePath = null) {
    const errors = [];
    const path = storagePath || parseStoragePathFromDownloadUrl(downloadUrl);
    const isFirebase = isFirebaseDownloadUrl(downloadUrl);

    if (downloadUrl?.startsWith('data:')) {
      const base64 = downloadUrl.split(',')[1];
      if (base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      }
    }

    if (isFirebase || path) {
      try {
        await ensureFirebaseAuth();
      } catch (err) {
        errors.push(`auth: ${err.message}`);
      }
    }

    if (path) {
      try {
        const bytes = await getBytes(sRef(storage, path));
        return bytes.slice().buffer;
      } catch (err) {
        errors.push(`getBytes(${path}): ${err.message}`);
      }
    }

    if (downloadUrl && isFirebase) {
      try {
        const blob = await getBlob(sRef(storage, downloadUrl));
        return await blob.arrayBuffer();
      } catch (err) {
        errors.push(`getBlob: ${err.message}`);
      }
    }

    if (downloadUrl) {
      try {
        return await httpDownloadArrayBuffer(downloadUrl);
      } catch (err) {
        errors.push(`HTTP: ${err.message}`);
      }
      try {
        const resp = await fetch(downloadUrl, { method: 'GET', cache: 'no-store' });
        if (resp.ok) return await resp.arrayBuffer();
        errors.push(`fetch: HTTP ${resp.status}`);
      } catch (err) {
        errors.push(`fetch: ${err.message}`);
      }
    }

    throw new Error(errors.join(' · ') || '無法下載檔案');
  }

  async function saveAllInventories(items) {
    const existingSnap = await get(ref(db, 'lab_inventories'));
    const existing = existingSnap.exists() ? existingSnap.val() : {};
    const payload = {};
    for (const item of items) {
      const sanitized = sanitizeInventoryForCloud(item);
      const prev = existing[item.id];
      if (prev) {
        if ((!sanitized.msds || !sanitized.msds.length) && Array.isArray(prev.msds) && prev.msds.length) {
          sanitized.msds = prev.msds;
        }
        if ((!sanitized.photos || !sanitized.photos.length) && Array.isArray(prev.photos) && prev.photos.length) {
          sanitized.photos = prev.photos;
        }
      }
      payload[item.id] = sanitized;
    }
    for (const [id, prev] of Object.entries(existing)) {
      if (!payload[id] && prev) payload[id] = prev;
    }
    await set(ref(db, 'lab_inventories'), payload);
  }

  async function deleteInventoryItem(id) {
    await remove(ref(db, `lab_inventories/${id}`));
  }

  async function saveRules(items) {
    await set(ref(db, 'lab_rules'), items || []);
  }

  async function saveMistakes(items) {
    await set(ref(db, 'lab_mistakes'), items || []);
  }

  function snapshotToList(snapshot) {
    if (!snapshot || !snapshot.exists()) return [];
    const data = snapshot.val();
    if (!data) return [];
    if (Array.isArray(data)) return data.filter(Boolean);
    return Object.values(data).filter(Boolean);
  }

  function toIdKeyedPayload(items, mapper) {
    const payload = {};
    for (const item of items || []) {
      if (!item?.id) continue;
      payload[item.id] = mapper ? mapper(item) : item;
    }
    return payload;
  }

  async function saveIncidents(items) {
    // Key by id so creates/updates/deletes sync reliably across devices
    await set(ref(db, 'lab_incidents'), toIdKeyedPayload(items));
  }

  async function fetchIncidents() {
    return snapshotToList(await get(ref(db, 'lab_incidents')));
  }

  async function fetchProcedures() {
    return snapshotToList(await get(ref(db, 'lab_procedure_files')));
  }

  async function fetchProcedureMeta() {
    const snap = await get(ref(db, 'lab_procedure_meta'));
    return snap.exists() ? snap.val() : null;
  }

  async function fetchBookings() {
    return snapshotToList(await get(ref(db, 'lab_bookings')));
  }

  async function saveBookings(items) {
    await set(ref(db, 'lab_bookings'), toIdKeyedPayload(items));
  }

  async function fetchLabRooms() {
    return snapshotToList(await get(ref(db, 'lab_rooms')));
  }

  async function saveLabRooms(items) {
    await set(ref(db, 'lab_rooms'), toIdKeyedPayload(items));
  }

  async function saveAllProcedures(items) {
    const payload = toIdKeyedPayload(items, sanitizeProcedureForCloud);
    if (Object.keys(payload).length) {
      await set(ref(db, 'lab_procedure_files'), payload);
      await set(ref(db, 'lab_procedure_meta'), { intentionallyEmpty: false, updatedAt: new Date().toISOString() });
    } else {
      await clearAllProcedures();
    }
  }

  async function clearAllProcedures() {
    await ensureFirebaseAuth();
    await set(ref(db, 'lab_procedure_files'), null);
    await set(ref(db, 'lab_procedure_meta'), {
      intentionallyEmpty: true,
      clearedAt: new Date().toISOString()
    });
    // Best-effort: remove uploaded procedure attachments from Storage
    try {
      const folderRef = sRef(storage, 'procedure_documents');
      const listing = await listAll(folderRef);
      await Promise.all(listing.items.map(itemRef => deleteObject(itemRef).catch(() => null)));
    } catch (err) {
      console.warn('Procedure storage cleanup skipped:', err?.message || err);
    }
  }

  async function listStorageFolder(folderPath) {
    const folderRef = sRef(storage, folderPath);
    const listing = await listAll(folderRef);
    const files = [];
    for (const itemRef of listing.items) {
      const [url, metadata] = await Promise.all([
        getDownloadURL(itemRef),
        getMetadata(itemRef)
      ]);
      files.push({
        folder: folderPath,
        storagePath: itemRef.fullPath,
        rawName: itemRef.name,
        url,
        size: metadata.size || 0,
        contentType: metadata.contentType || '',
        timeCreated: metadata.timeCreated || metadata.updated || ''
      });
    }
    return files;
  }

  async function recoverAllAttachments() {
    const [msdsFiles, photoFiles, procedureFiles, handbookFiles, prepGuideFiles, invSnap, procSnap, handbookSnap, prepGuideSnap] = await Promise.all([
      listStorageFolder('msds_files'),
      listStorageFolder('inventory_photos'),
      listStorageFolder('procedure_documents'),
      listStorageFolder('safety_handbook'),
      listStorageFolder('prep_guide'),
      get(ref(db, 'lab_inventories')),
      get(ref(db, 'lab_procedure_files')),
      get(ref(db, 'lab_safety_handbook')),
      get(ref(db, 'lab_prep_guide'))
    ]);

    if (typeof window.applyAttachmentRecovery !== 'function') {
      throw new Error('恢復模組尚未就緒，請重新整理頁面後重試。');
    }

    return window.applyAttachmentRecovery({
      storageFiles: {
        msds_files: msdsFiles,
        inventory_photos: photoFiles,
        procedure_documents: procedureFiles,
        safety_handbook: handbookFiles,
        prep_guide: prepGuideFiles
      },
      cloudInventories: invSnap.exists() ? Object.values(invSnap.val()) : [],
      cloudProcedures: procSnap.exists() ? Object.values(procSnap.val()) : [],
      cloudHandbook: handbookSnap.exists() ? handbookSnap.val() : null,
      cloudPrepGuide: prepGuideSnap.exists() ? prepGuideSnap.val() : null
    });
  }

  async function saveSafetyHandbook(meta) {
    await set(ref(db, 'lab_safety_handbook'), meta || null);
  }

  async function savePrepGuide(meta) {
    await set(ref(db, 'lab_prep_guide'), meta || null);
  }

  window.CloudSync = {
    ready: true,
    uploadFile,
    uploadBlob,
    downloadFileBytes,
    saveAllInventories,
    deleteInventoryItem,
    saveRules,
    saveMistakes,
    saveIncidents,
    fetchIncidents,
    fetchProcedures,
    fetchProcedureMeta,
    saveBookings,
    fetchBookings,
    saveLabRooms,
    fetchLabRooms,
    saveAllProcedures,
    clearAllProcedures,
    saveSafetyHandbook,
    savePrepGuide,
    recoverAllAttachments
  };
  window.dispatchEvent(new Event('cloudsync-ready'));

  onValue(ref(db, 'lab_inventories'), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    const list = Object.values(data);
    if (typeof window.applyCloudInventories === 'function') {
      window.applyCloudInventories(list);
    }
  });

  onValue(ref(db, 'lab_rules'), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    const list = Array.isArray(data) ? data : Object.values(data);
    if (typeof window.applyCloudRules === 'function') {
      window.applyCloudRules(list);
    }
  });

  onValue(ref(db, 'lab_mistakes'), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    const list = Array.isArray(data) ? data : Object.values(data);
    if (typeof window.applyCloudMistakes === 'function') {
      window.applyCloudMistakes(list);
    }
  });

  onValue(ref(db, 'lab_incidents'), (snapshot) => {
    const list = snapshotToList(snapshot);
    // Apply empty lists only after live sync is ready, so deletes propagate
    if (!list.length && !window._incidentsLiveSyncReady && !window._incidentsCloudBootstrapDone) return;
    if (typeof window.applyCloudIncidents === 'function') {
      window.applyCloudIncidents(list);
    }
  });

  onValue(ref(db, 'lab_bookings'), (snapshot) => {
    const list = snapshotToList(snapshot);
    if (!list.length && !window._bookingsCloudBootstrapDone) return;
    if (typeof window.applyCloudBookings === 'function') {
      window.applyCloudBookings(list);
    }
  });

  onValue(ref(db, 'lab_rooms'), (snapshot) => {
    const list = snapshotToList(snapshot);
    if (!list.length && !window._labRoomsCloudBootstrapDone) return;
    if (typeof window.applyCloudLabRooms === 'function') {
      window.applyCloudLabRooms(list);
    }
  });

  onValue(ref(db, 'lab_procedure_files'), (snapshot) => {
    const list = snapshotToList(snapshot);
    if (!list.length && !window._proceduresLiveSyncReady && !window._procedureCloudBootstrapDone) return;
    if (typeof window.applyCloudProcedures === 'function') {
      window.applyCloudProcedures(list);
    }
  });

  onValue(ref(db, 'lab_safety_handbook'), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    if (typeof window.applyCloudSafetyHandbook === 'function') {
      window.applyCloudSafetyHandbook(data);
    }
  });

  onValue(ref(db, 'lab_prep_guide'), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    if (typeof window.applyCloudPrepGuide === 'function') {
      window.applyCloudPrepGuide(data);
    }
  });

  console.log('Firebase cloud sync ready — all admin data syncs across devices.');
