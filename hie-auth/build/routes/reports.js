"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const reports_1 = require("../lib/reports");
const router = express_1.default.Router();
router.use(express_1.default.json());
router.get("/generate-710", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let { data } = req.body;
        let report = yield (0, reports_1.computeMOH710)();
        // if (Object.keys(token).indexOf('error') > -1){
        //     res.statusCode = 401;
        //     res.json({status:"error", error: `${token.error} - ${token.error_description}`})
        //     return;
        // }
        res.statusCode = 200;
        res.json({ status: "success", report });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password", status: "error" });
        return;
    }
}));
exports.default = router;
