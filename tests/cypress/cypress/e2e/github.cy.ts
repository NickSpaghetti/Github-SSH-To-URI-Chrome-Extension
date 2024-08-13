it('should be able to navigate to github.com', () => {
    cy.clearAllCookies()
    cy.clearLocalStorage()
    cy.visit('https://github.com');
});

it('should be able to find the file extension on github.com from url', () => {
    cy.visit('https://github.com/NickSpaghetti/Salve-Amulet-Checker/blob/master/src/main/java/com/sac/SalveAmuletCheckerPlugin.java');
    cy.url({ decode: true }).should('contain', '.java')
});


it('find java code', () => {
    cy.visit('https://github.com/NickSpaghetti/Salve-Amulet-Checker/blob/master/src/main/java/com/sac/SalveAmuletCheckerPlugin.java');
    cy.get("#read-only-cursor-text-area")
        .should('not.be.undefined')

});



