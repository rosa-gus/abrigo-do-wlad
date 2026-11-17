import type {
  AdoptionRepository,
  DashboardReader,
  DogRepository,
  RecycleRepository,
  SettingsRepository,
  StoredAdoption,
} from "../../ports/admin";
import { resolveAdminDog } from "../../application/dog-identity";
import type { FirestoreRestClient, FirestoreQueryFilter } from "../firestore";
import { commitDogMediaMutation } from "./media-assets";

type ClientProvider = () => FirestoreRestClient;

/** The caller supplies one request-scoped client whose commit metadata includes audit/outbox. */
export function createDogRepository(
  env: Env,
  getClient: ClientProvider,
): DogRepository {
  return {
    list: (input) =>
      getClient().pageDocuments("dogs", {
        limit: input.limit,
        cursor: input.cursor,
        scope: input.state,
        filters: input.publication
          ? [
              {
                fieldPath: "publicationStatus",
                op: "EQUAL",
                value: input.publication,
              },
            ]
          : [],
      }),
    find: (routeId) => resolveAdminDog(getClient(), routeId),
    commit: (mutation) => commitDogMediaMutation(env, mutation, getClient()),
    async archive(document, data, incrementAdoptions) {
      if (incrementAdoptions)
        await getClient().updateDocumentAndIncrementField(
          document.name,
          data,
          "system/statistics",
          "adoptionsCount",
          1,
          { expectedUpdateTime: document.updateTime },
        );
      else
        await getClient().updateDocument(document.name, data, {
          expectedUpdateTime: document.updateTime,
        });
    },
    async restore(document, data) {
      await getClient().updateDocument(document.name, data, {
        expectedUpdateTime: document.updateTime,
      });
    },
    inventory: () => getClient().listDocuments("dogs"),
  };
}
export function createRecycleRepository(
  getClient: ClientProvider,
): RecycleRepository {
  return {
    list: (input) =>
      getClient().pageDocuments("recycle_points", {
        limit: input.limit,
        cursor: input.cursor,
        filters: input.publication
          ? [
              {
                fieldPath: "publicationStatus",
                op: "EQUAL",
                value: input.publication,
              },
            ]
          : [],
      }),
    get: (id) => getClient().getDocument(`recycle_points/${id}`),
    create: (data) => getClient().createDocument("recycle_points", data),
    async update(document, data) {
      await getClient().updateDocument(document.name, data, {
        expectedUpdateTime: document.updateTime,
      });
    },
    async delete(document) {
      await getClient().deleteDocumentsIfUnchanged([
        { name: document.name, updateTime: document.updateTime! },
      ]);
    },
  };
}
export function createSettingsRepository(
  getClient: ClientProvider,
): SettingsRepository {
  return {
    get: () => getClient().getDocument("system/settings"),
    save: (document, data) =>
      document
        ? getClient().updateDocument(document.name, data, {
            expectedUpdateTime: document.updateTime,
          })
        : getClient().createDocument("system", data, {
            documentId: "settings",
          }),
  };
}
export function createAdoptionRepository(
  getReadClient: ClientProvider,
  getWriteClient: ClientProvider = getReadClient,
): AdoptionRepository {
  return {
    list(input) {
      const filters: FirestoreQueryFilter[] = [
        { fieldPath: "expiresAt", op: "GREATER_THAN", value: input.now },
      ];
      if (input.status)
        filters.push({ fieldPath: "status", op: "EQUAL", value: input.status });
      return getReadClient().pageDocuments<StoredAdoption>(
        "adoption_application",
        {
          limit: input.limit,
          cursor: input.cursor,
          filters,
          orderBy: "expiresAt",
          movingTimestampCutoff: true,
        },
      );
    },
    get: (id) =>
      getReadClient().getDocument<StoredAdoption>(`adoption_application/${id}`),
    update: (document, data) =>
      getWriteClient().updateDocument(document.name, data, {
        expectedUpdateTime: document.updateTime,
      }),
  };
}
export function createDashboardReader(
  getClient: ClientProvider,
  observe: <T>(name: string, operation: () => Promise<T>) => Promise<T>,
): DashboardReader {
  return {
    async read(now, alertWindowEnd) {
      const [
        dogTotal,
        archivedDogs,
        recycles,
        publishedDogTotal,
        archivedPublishedDogs,
        publishedRecycles,
        adoptions,
        expiringDocuments,
        statistics,
      ] = await Promise.all([
        observe("dogs.countTotal", () => getClient().countDocuments("dogs")),
        observe("dogs.countArchived", () =>
          getClient().countDocuments("dogs", {
            filters: [
              { fieldPath: "archivedAt", op: "GREATER_THAN", value: "" },
            ],
          }),
        ),
        observe("recycle.countTotal", () =>
          getClient().countDocuments("recycle_points"),
        ),
        observe("dogs.countPublished", () =>
          getClient().countDocuments("dogs", {
            filters: [
              {
                fieldPath: "publicationStatus",
                op: "EQUAL",
                value: "published",
              },
            ],
          }),
        ),
        observe("dogs.countArchivedPublished", () =>
          getClient().countDocuments("dogs", {
            filters: [
              { fieldPath: "archivedAt", op: "GREATER_THAN", value: "" },
              {
                fieldPath: "publicationStatus",
                op: "EQUAL",
                value: "published",
              },
            ],
          }),
        ),
        observe("recycle.countPublished", () =>
          getClient().countDocuments("recycle_points", {
            filters: [
              {
                fieldPath: "publicationStatus",
                op: "EQUAL",
                value: "published",
              },
            ],
          }),
        ),
        observe("adoptions.countActive", () =>
          getClient().countDocuments("adoption_application", {
            timestampAfter: { fieldPath: "expiresAt", cutoff: now },
          }),
        ),
        observe("adoptions.expiring", () =>
          getClient().findDocumentsByTimestampRange<StoredAdoption>(
            "adoption_application",
            "expiresAt",
            now,
            alertWindowEnd,
            25,
          ),
        ),
        observe("statistics.read", () =>
          getClient().getDocument<{ adoptionsCount?: unknown }>(
            "system/statistics",
          ),
        ),
      ]);
      return {
        dogTotal,
        archivedDogs,
        recycles,
        publishedDogTotal,
        archivedPublishedDogs,
        publishedRecycles,
        adoptions,
        expiringDocuments,
        statistics,
      };
    },
  };
}
