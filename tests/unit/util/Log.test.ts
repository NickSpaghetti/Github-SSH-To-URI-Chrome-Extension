import { expect, jest } from "@jest/globals";
import { logRecovered } from "../../../src/util/Log";

let debug: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
    debug = jest.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("Given a recovered failure", () => {
    describe("When it has no error", () => {
        test("Then I expect the prefixed message at the debug level", () => {
            // Arrange
            const message = "could not open session storage";

            // Act
            logRecovered(message);

            // Assert
            expect(debug).toHaveBeenCalledWith(
                "[iac-module-linker] could not open session storage",
            );
        });
    });

    describe("When it has an error", () => {
        test("Then I expect the error's text after the message", () => {
            // Arrange
            const error = new TypeError("Failed to fetch");

            // Act
            logRecovered("could not reach the registry", error);

            // Assert
            expect(debug).toHaveBeenCalledWith(
                "[iac-module-linker] could not reach the registry: TypeError: Failed to fetch",
            );
        });
    });
});
