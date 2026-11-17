# Department of Files

## Purpose and audience

A browser-based university practical for account registration, authentication,
private PDF storage and retrieval. Students use the application to demonstrate
Docker networking, PHP request handling and MySQL database integration.

## Application experience

Users create an account or sign in, choose a PDF and submit it to their private
file drawer. Each upload includes a database receipt showing its record ID,
owner and storage key. Collection provides a temporary download link and retains
the receipt in the drawer. Pagination and refresh expose the current file state.

## Platform

Docker Compose runs Nginx, an Apache/PHP backend, MySQL, S3-compatible MinIO and
a PHP cleanup worker on Ubuntu. MySQL stores account, session and file records;
MinIO stores PDF bytes. The browser accesses the GUI and API through Nginx.

## Visual identity

The interface uses the voice of a small, deliberately bureaucratic file office.
Deep green surfaces, condensed headings, square controls and restrained paper
animations support the filing metaphor. Errors use clear, direct language.

## Interaction principles

Keep registration, upload and collection easy to follow. Make database receipts
visible alongside files. Show loading, empty, error and collected states. Keep
technical explanations in the expandable classroom architecture map.

## Accessibility

Forms use labels and keyboard controls. The layout adapts to small screens, error
messages explain recovery, and reduced-motion preferences disable animation.
Fonts and icons are served locally with their licences.
