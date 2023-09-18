import { cpSync, rmdirSync } from "fs";

switch(Number(process.argv[2])) {
    case 1:
        try {
            rmdirSync("./packageSrc/", { recursive: true, force: true });
        }
        catch {}
}
