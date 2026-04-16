"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ragCorpus = void 0;
exports.getRagCorpus = getRagCorpus;
const corpus_json_1 = __importDefault(require("./corpus.json"));
exports.ragCorpus = corpus_json_1.default;
function getRagCorpus() {
    return exports.ragCorpus;
}
