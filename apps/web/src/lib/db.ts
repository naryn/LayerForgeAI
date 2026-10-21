import type {
  ProjectRecord,
  StoredProjectFile,
  StoredSnapshot,
} from "./domain";

const DB_NAME = "layerforge";
const DB_VERSION = 1;

const STORE_PROJECTS = "projects";
const STORE_FILES = "files";
const STORE_SNAPSHOTS = "snapshots";

let databasePromise: Promise<IDBDatabase> | null = null;

function isPlainContainer(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null || Array.isArray(value);
}

/**
 * Structured clone rejects Vue reactive proxies, so records built by spreading
 * store state are unwrapped here before they reach IndexedDB. Class instances
 * such as Blob/File/Date keep their identity and are cloned by the browser.
 */
export function toPlain<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item)) as unknown as T;
  }
  if (isPlainContainer(value)) {
    const plain: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) plain[key] = toPlain(item);
    return plain as T;
  }
  return value;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("当前浏览器不支持 IndexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_PROJECTS)) {
        database.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(STORE_FILES)) {
        database.createObjectStore(STORE_FILES, { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        const store = database.createObjectStore(STORE_SNAPSHOTS, { keyPath: "key" });
        store.createIndex("projectId", "projectId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开 IndexedDB"));
  });
  return databasePromise;
}

export class ProjectRepository {
  async list(): Promise<ProjectRecord[]> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_PROJECTS, "readonly");
    const done = transactionDone(transaction);
    const records = await requestAsPromise(transaction.objectStore(STORE_PROJECTS).getAll());
    await done;
    return (records as ProjectRecord[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(projectId: string): Promise<ProjectRecord | undefined> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_PROJECTS, "readonly");
    const done = transactionDone(transaction);
    const record = await requestAsPromise(
      transaction.objectStore(STORE_PROJECTS).get(projectId),
    );
    await done;
    return record as ProjectRecord | undefined;
  }

  async put(project: ProjectRecord): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_PROJECTS, "readwrite");
    transaction.objectStore(STORE_PROJECTS).put(toPlain(project));
    await transactionDone(transaction);
  }

  async remove(projectId: string): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(
      [STORE_PROJECTS, STORE_FILES, STORE_SNAPSHOTS],
      "readwrite",
    );
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_PROJECTS).delete(projectId);
    transaction.objectStore(STORE_FILES).delete(projectId);
    const snapshotStore = transaction.objectStore(STORE_SNAPSHOTS);
    const keys = await requestAsPromise(snapshotStore.index("projectId").getAllKeys(projectId));
    for (const key of keys) snapshotStore.delete(key);
    await done;
  }

  async putFile(file: StoredProjectFile, project?: ProjectRecord): Promise<void> {
    const database = await openDatabase();
    const stores = project ? [STORE_FILES, STORE_PROJECTS] : [STORE_FILES];
    const transaction = database.transaction(stores, "readwrite");
    transaction.objectStore(STORE_FILES).put(toPlain(file));
    if (project) transaction.objectStore(STORE_PROJECTS).put(toPlain(project));
    await transactionDone(transaction);
  }

  async getFile(projectId: string): Promise<StoredProjectFile | undefined> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_FILES, "readonly");
    const done = transactionDone(transaction);
    const record = await requestAsPromise(
      transaction.objectStore(STORE_FILES).get(projectId),
    );
    await done;
    return record as StoredProjectFile | undefined;
  }

  async putSnapshot(snapshot: StoredSnapshot): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_SNAPSHOTS, "readwrite");
    transaction.objectStore(STORE_SNAPSHOTS).put(toPlain(snapshot));
    await transactionDone(transaction);
  }

  async getSnapshot(key: string): Promise<StoredSnapshot | undefined> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_SNAPSHOTS, "readonly");
    const done = transactionDone(transaction);
    const record = await requestAsPromise(
      transaction.objectStore(STORE_SNAPSHOTS).get(key),
    );
    await done;
    return record as StoredSnapshot | undefined;
  }
}

export const projectRepository = new ProjectRepository();

export function localSnapshotKey(projectId: string): string {
  return `local:${projectId}`;
}

export function revisionSnapshotKey(projectId: string, revisionId: string): string {
  return `revision:${projectId}:${revisionId}`;
}
