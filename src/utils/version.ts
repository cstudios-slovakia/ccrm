export const VERSION = "1.12.75-Mango";
// Release codename ("Mango"), used to name the RAG assistant. Kept as its own
// export because RagAiView reads it at module scope — dropping it silently named
// the assistant `undefined`.
export const VERSION_CODENAME = VERSION.split("-")[1] || "Mango";
