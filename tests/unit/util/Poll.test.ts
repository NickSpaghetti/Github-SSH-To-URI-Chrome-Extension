import { expect } from "@jest/globals";
import { pollUntilAsync } from "../../../src/util/Poll";

describe("Given something the page has not rendered yet", () => {
    describe("When it is there on the first read", () => {
        test("Then I expect it returned without waiting", async () => {
            // Arrange
            let reads = 0;
            const read = () => {
                reads += 1;
                return "ready";
            };

            // Act
            const answer = await pollUntilAsync(read, 1_000, 10);

            // Assert
            expect<string | null>(answer).toBe("ready");
            expect<number>(reads).toBe(1);
        });
    });

    describe("When it arrives after a few reads", () => {
        test("Then I expect the whole wait to run and the value to come back", async () => {
            // Arrange
            let reads = 0;
            const read = () => {
                reads += 1;
                return reads < 4 ? null : "ready";
            };

            // Act
            const answer = await pollUntilAsync(read, 1_000, 5);

            // Assert
            expect<string | null>(answer).toBe("ready");
            expect<number>(reads).toBe(4);
        });
    });

    describe("When the reader is async", () => {
        test("Then I expect it awaited each time", async () => {
            // Arrange
            let reads = 0;
            const read = () => {
                reads += 1;
                return Promise.resolve(reads < 3 ? null : 42);
            };

            // Act
            const answer = await pollUntilAsync(read, 1_000, 5);

            // Assert
            expect<number | null>(answer).toBe(42);
        });
    });

    describe("When it never arrives", () => {
        test("Then I expect null once the deadline passes, not a hang", async () => {
            // Arrange
            const began = Date.now();

            // Act
            const answer = await pollUntilAsync(() => null, 120, 20);

            // Assert
            expect<unknown>(answer).toBeNull();
            expect<boolean>(Date.now() - began >= 120).toBe(true);
        });
    });

    describe("When the value is falsy but not null", () => {
        test("Then I expect it accepted, because only null means not yet", async () => {
            // Act
            const answers = [
                await pollUntilAsync(() => 0, 100, 5),
                await pollUntilAsync(() => "", 100, 5),
                await pollUntilAsync(() => false, 100, 5),
            ];

            // Assert
            expect(answers).toEqual([0, "", false]);
        });
    });
});
