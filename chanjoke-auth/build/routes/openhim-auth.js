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
const utils_1 = require("../lib/utils");
const router = express_1.default.Router();
router.use(express_1.default.json());
router.get("/client", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let token = yield utils_1.getOpenHIMToken();
        yield utils_1.installChannels();
        res.set(token);
        res.json({ status: "success", token });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password" });
        return;
    }
}));
/*
  ____                   _    _ _____ __  __ _____             _
 / __ \                 | |  | |_   _|  \/  |  __ \           | |
| |  | |_ __   ___ _ __ | |__| | | | | \  / | |__) |___  _   _| |_ ___  ___
| |  | | '_ \ / _ \ '_ \|  __  | | | | |\/| |  _  // _ \| | | | __/ _ \/ __|
| |__| | |_) |  __/ | | | |  | |_| |_| |  | | | \ \ (_) | |_| | ||  __/\__ \
 \____/| .__/ \___|_| |_|_|  |_|_____|_|  |_|_|  \_\___/ \__,_|\__\___||___/
       | |
       |_|

*/
// Login
router.get("/token", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let token = yield utils_1.getOpenHIMToken();
        yield utils_1.installChannels();
        res.set(token);
        res.json({ status: "success", token });
        return;
    }
    catch (error) {
        console.log(error);
        res.statusCode = 401;
        res.json({ error: "incorrect email or password" });
        return;
    }
}));
// Login
router.post("/client", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield utils_1.getOpenHIMToken();
        let { name, password } = req.body;
        let response = yield utils_1.createClient(name, password);
        if (response === "Unauthorized" || response.indexOf("error") > -1) {
            res.statusCode = 401;
            res.json({ status: "error", error: response });
            return;
        }
        res.statusCode = 201;
        res.json({ status: "success", response });
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
