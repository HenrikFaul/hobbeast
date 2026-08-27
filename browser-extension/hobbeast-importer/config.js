/**
 * Where the extension hands its findings over.
 *
 * This is the only thing the extension needs to be told, and it is not a
 * secret — so unlike the first version there is no key to copy in, and no
 * config.example.js to remember. Point it at http://localhost:8080 to try a
 * change against a local Hobbeast.
 */
export const HOBBEAST_ORIGIN = 'https://expericentre.com';
