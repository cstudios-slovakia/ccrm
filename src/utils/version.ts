export const VERSION = "1.10.38-Kiwi";
// Release codename ("Kiwi"), used to name the RAG assistant. Kept as its own
// export because RagAiView reads it at module scope — dropping it silently named
// the assistant `undefined`.
export const VERSION_CODENAME = VERSION.split("-")[1] || "Kiwi";
