import { expect } from "@jest/globals";
import { isQuotaRefusal } from "../../../src/services/StorageRefusal";

describe("Given a rejected storage write", () => {
    describe("When chrome refused it for want of room", () => {
        test("Then I expect it recognised", () => {
            // Arrange
            const errors = [
                new Error("Session storage quota bytes exceeded. Values were not stored."),
                new Error("QUOTA_BYTES quota exceeded"),
                "Error: Session storage quota bytes exceeded.",
            ];

            // Act
            const recognised = errors.map(isQuotaRefusal);

            // Assert
            expect<boolean[]>(recognised).toEqual(errors.map(() => true));
        });
    });

    describe("When it was refused for some other reason", () => {
        test("Then I expect it not recognised, so the caller can say so", () => {
            // Arrange
            const errors = [
                new Error("Extension context invalidated."),
                new Error("Access to storage is not allowed from this context."),
                new Error("The message port closed before a response was received."),
            ];

            // Act
            const recognised = errors.map(isQuotaRefusal);

            // Assert
            expect<boolean[]>(recognised).toEqual(errors.map(() => false));
        });
    });

    describe("When it is not an Error at all", () => {
        test("Then I expect an answer rather than a throw", () => {
            // Arrange
            const rejections: unknown[] = [null, undefined, 42, {}, [], "quota"];

            // Act
            const recognised = rejections.map(isQuotaRefusal);

            // Assert
            expect<boolean[]>(recognised).toEqual([false, false, false, false, false, true]);
        });
    });
});
