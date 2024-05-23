"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const codes = {
    none: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: `48590`,
        display: `None`,
    },
    bcg: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: "10512",
        display: "BCG Vaccine",
    },
    opv: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: "6032",
        display: "Polio Vaccination, Oral",
    },
    pcv: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: "24499",
        display: "Decavalent Pneumococcal Vaccine (Pneumococcal Conjugate Vaccine)",
    },
    penta: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: "14676",
        display: "Diphtheria Toxoid / Hepatitis B Vaccines / Pertussis, Acellular / Tetanus Toxoid / Haemophilus Capsular Oligosaccharide",
    },
    ipv: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: "555",
        display: "Polio vaccine (IPV) Multi dose vial Injection",
    },
    rota: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: "2760",
        display: "Rotavirus Vaccines",
    },
    vitamin_a: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: "1107",
        display: "Vitamin A",
    },
    measles: {
        system: utils_1.NHDD_GENERIC_PATH,
        code: "5456",
        display: "Measles Vaccine",
    }
};
