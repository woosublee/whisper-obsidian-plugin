import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";

export interface LocalModel {
	id: string;
	name: string;
	description: string;
}

export const LOCAL_MODELS: LocalModel[] = [
	{
		id: "mlx-community/whisper-large-v3-turbo",
		name: "Whisper Large v3 Turbo",
		description: "빠름 · 정확도 높음 (추천)",
	},
	{
		id: "mlx-community/whisper-large-v3-mlx",
		name: "Whisper Large v3",
		description: "최고 정확도 · 느림",
	},
	{
		id: "mlx-community/whisper-medium-mlx",
		name: "Whisper Medium",
		description: "균형잡힌 성능",
	},
	{
		id: "mlx-community/whisper-small-mlx",
		name: "Whisper Small",
		description: "빠름 · 정확도 보통",
	},
	{
		id: "mlx-community/whisper-tiny-mlx",
		name: "Whisper Tiny",
		description: "가장 빠름 · 정확도 낮음",
	},
];

export async function transcribeLocally(
	blob: Blob,
	fileName: string,
	whisperBin: string,
	model: string,
	language: string,
	temperature: number
): Promise<string> {
	const tmpDir = os.tmpdir();
	const ext = path.extname(fileName) || ".m4a";
	const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const tmpInput = path.join(tmpDir, `whisper-obs-${uid}${ext}`);
	const tmpOutput = path.join(tmpDir, `whisper-obs-out-${uid}`);

	const arrayBuffer = await blob.arrayBuffer();
	fs.writeFileSync(tmpInput, Buffer.from(arrayBuffer));
	fs.mkdirSync(tmpOutput, { recursive: true });

	try {
		const args = [
			tmpInput,
			"--model",
			model,
			"--output-format",
			"txt",
			"--output-dir",
			tmpOutput,
			"--condition-on-previous-text",
			"False",
			"--temperature",
			String(temperature),
			"--compression-ratio-threshold",
			"2.4",
			"--no-speech-threshold",
			"0.6",
		];
		if (language && language !== "auto") {
			args.push("--language", language);
		}

		const home = os.homedir();
		const env: NodeJS.ProcessEnv = {
			...process.env,
			PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${home}/.local/bin`,
			HOME: home,
		};

		await runProcess(whisperBin, args, env);

		const baseName = path.basename(tmpInput, ext);
		const outputFile = path.join(tmpOutput, `${baseName}.txt`);
		const text = fs.readFileSync(outputFile, "utf-8");
		return text.trim();
	} finally {
		try {
			fs.unlinkSync(tmpInput);
		} catch {}
		try {
			fs.rmSync(tmpOutput, { recursive: true, force: true });
		} catch {}
	}
}

function runProcess(
	bin: string,
	args: string[],
	env: NodeJS.ProcessEnv
): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(bin, args, { env });

		let stderr = "";
		proc.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("close", (code: number | null) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`mlx_whisper이 종료 코드 ${code}로 실패했습니다.\n${stderr}`
					)
				);
			}
		});

		proc.on("error", (err: Error) => {
			reject(
				new Error(
					`mlx_whisper 실행 실패: ${err.message}\n경로를 확인해 주세요: ${bin}`
				)
			);
		});
	});
}
