export default {
  id: "0001-publication-status",
  description: "Publicação de cães e pontos de coleta; versão inicial dos documentos.",
  collections: [
    { name: "dogs", from: 0, to: 1 },
    { name: "recycle_points", from: 0, to: 1 },
  ],
  transform({ document, now }) {
    const fields = document.fields ?? {};
    const status = fields.publicationStatus?.stringValue ?? "published";
    if (fields.publicationStatus !== undefined && !["draft", "published"].includes(fields.publicationStatus.stringValue)) {
      throw new Error("Invalid publication status.");
    }
    return { set: {
      ...(fields.publicationStatus === undefined ? { publicationStatus: { stringValue: status } } : {}),
      ...(fields.updatedAt === undefined ? { updatedAt: { stringValue: document.updateTime ?? now } } : {}),
      ...(status === "published" && fields.publishedAt === undefined
        ? { publishedAt: { stringValue: document.createTime ?? now } } : {}),
    } };
  },
};
