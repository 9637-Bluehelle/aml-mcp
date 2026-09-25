/// <reference types="vite/client" />

// Tabella code page di SheetJS (decodifica .xls legacy Windows-1252). Non ha
// type definitions proprie: la importiamo come modulo opaco.
declare module 'xlsx/dist/cpexcel.full.mjs';
