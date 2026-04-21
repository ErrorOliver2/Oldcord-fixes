import { existsSync, mkdirSync, writeFileSync } from "fs";
import { generateString } from "../../helpers/globalutils.ts";
import md5 from "../../helpers/md5.ts";

export const UploadService = {
    saveImage(type: string, id: string, base64Data: string): string {
        if (!base64Data.includes('data:image')) {
            return base64Data;
        }

        const extension = base64Data.split('/')[1].split(';')[0].replace('jpeg', 'jpg');
        const imgBuffer = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const fileHash = md5(generateString(30)).toString();

        const dir = `www_dynamic/${type}/${id}`;

        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        writeFileSync(`${dir}/${fileHash}.${extension}`, imgBuffer, 'base64');
        return fileHash;
    },
};