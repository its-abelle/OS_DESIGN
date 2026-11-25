<?php
// This GUI is rendered by Apache/PHP; JavaScript provides interactive API calls.
require '/var/www/app/vendor/autoload.php';
$uploadLimitMb = (int) (\Department\Config::maxUploadBytes() / 1048576);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#ffffff" />
    <meta
      name="description"
      content="A private workspace to upload and collect your PDFs."
    />
    <title>Department of Files — Your PDF workspace</title>
    <link rel="icon" href="/assets/file-pdf.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css?v=<?= hash_file('sha256', __DIR__ . '/styles.css') ?>" />
    <script type="module" src="/app.js?v=<?= hash_file('sha256', __DIR__ . '/app.js') ?>"></script>
  </head>
  <body data-authenticated="false">
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="masthead wrap">
      <a class="brand" href="/" aria-label="Department of Files home"
        ><span class="brand-mark" aria-hidden="true"
          ><img src="/assets/file-pdf.svg" alt="" /></span
        ><span>Department of Files</span
        ></a
      >
      <nav class="workspace-nav" id="workspace-nav" aria-label="Main navigation" hidden>
        <a href="#files-heading" aria-current="page">My files</a>
      </nav>
      <div class="session-controls" id="session-controls" hidden>
        <span class="user-label"
          ><span id="user-name"></span></span
        ><button class="button button-outline" id="logout" type="button">
          <img src="/assets/sign-out.svg" alt="" />Sign out
        </button>
      </div>
      <a class="header-link" id="auth-nav" href="#privacy-note">Privacy</a>
    </header>
    <main id="main" class="wrap" tabindex="-1">
      <section
        id="auth-view"
        class="entrance"
        aria-labelledby="auth-heading"
      >
        <section class="auth-panel" aria-labelledby="auth-heading">
          <img class="auth-illustration" src="/assets/folder-friend.webp" width="144" height="112" alt="" aria-hidden="true" />
          <div class="auth-inner">
            <div class="mode-switch" role="group" aria-label="Account action">
              <button type="button" id="login-mode" aria-pressed="true">
                Sign in</button
              ><button type="button" id="register-mode" aria-pressed="false">
                Create account
              </button>
            </div>
            <h1 id="auth-heading">Sign in to your account</h1>
            <p id="auth-description" class="muted">
              Enter your details to access your files.
            </p>
            <form id="auth-form">
              <div id="username-field" hidden>
                <label for="username">Username</label
                ><input
                  id="username"
                  name="username"
                  autocomplete="username"
                  minlength="3"
                  maxlength="50"
                  pattern="[a-zA-Z0-9_\-]{3,50}"
                  placeholder="your_username"
                  disabled
                /><small>3–50 letters, numbers, underscores or hyphens.</small>
              </div>
              <div>
                <label for="email">Email address</label
                ><input
                  id="email"
                  name="email"
                  type="email"
                  autocomplete="email"
                  maxlength="254"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label for="password">Password</label>
                <div class="password-field">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    minlength="8"
                    placeholder="At least 8 characters"
                    required
                  /><button
                    id="show-password"
                    type="button"
                    aria-label="Show password"
                    aria-pressed="false"
                  >
                    <img src="/assets/eye.svg" alt="" />
                  </button>
                </div>
              </div>
              <p class="form-error" id="auth-error" role="alert" hidden></p>
              <button
                class="button button-primary auth-submit"
                id="auth-submit"
                type="submit"
                disabled
              >
                <span id="auth-submit-label">Checking session…</span
                ><img src="/assets/arrow-right.svg" alt="" />
              </button>
            </form>
            <button class="text-button" id="session-retry" type="button" hidden>
              Retry connection
            </button>
            <p class="auth-footnote" id="privacy-note">
              <img src="/assets/lock-simple.svg" alt="" />Your files are private. Only you can access them.
            </p>
          </div>
        </section>
      </section>
      <section id="workspace" aria-labelledby="workspace-heading" hidden>
        <div class="workspace-heading">
          <div class="workspace-title">
            <img class="workspace-avatar" src="/assets/folder-friend.webp" width="80" height="80" alt="" />
            <div>
            <h1 id="workspace-heading">My files</h1>
            <p id="greeting">
              Manage your uploaded PDFs.
            </p>
            </div>
          </div>
          <button class="button button-primary" id="choose-upload" type="button">Upload a file<img src="/assets/arrow-right.svg" alt="" /></button>
        </div>
        <div class="notice" id="notice" role="status" aria-live="polite" hidden>
          <span id="notice-text"></span
          ><button
            type="button"
            id="dismiss-notice"
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
        <div class="desk-layout">
          <section class="files-panel" aria-labelledby="files-heading">
            <div class="files-heading">
              <div>
                <h2 id="files-heading">All files</h2>
                <p id="record-count" class="muted">Loading your files…</p>
              </div>
              <form class="file-search" id="file-search-form" role="search" aria-label="Search your files">
                <label class="visually-hidden" for="file-search">Search filenames</label>
                <input id="file-search" name="search" type="search" placeholder="Search files by name" maxlength="100" />
                <button class="button" id="search-submit" type="submit">Search</button>
              </form>
              <button class="button button-small" id="refresh" type="button">
                <img src="/assets/arrows-clockwise.svg" alt="" /><span
                  >Refresh</span
                >
              </button>
            </div>
            <p class="list-error" id="list-error" role="alert" hidden></p>
            <div class="list-loading" id="list-loading" role="status">
              <span>Loading your files…</span><i></i><i></i><i></i>
            </div>
            <div class="empty-state" id="empty-state" hidden>
              <span class="empty-icon" aria-hidden="true"
                ><img src="/assets/open-folder.webp" width="120" height="96" alt=""
              /></span>
              <h3 id="empty-heading">No files yet</h3>
              <p id="empty-description">
                Upload a PDF to keep it in your workspace.
              </p>
              <button class="text-button" type="button" id="empty-choose">
                Upload your first file
              </button>
            </div>
            <div class="file-columns" aria-hidden="true">
              <span>Name</span><span>Status</span><span>Action</span>
            </div>
            <ul
              class="file-list"
              id="file-list"
              aria-label="Your uploaded files"
            ></ul>
            <nav class="pagination" aria-label="File pages">
              <span id="page-status" role="status" aria-live="polite">Page 1</span>
              <div>
                <button class="button button-small" id="previous-page" type="button" disabled>Previous</button>
                <button class="button button-small" id="next-page" type="button" disabled>Next</button>
              </div>
            </nav>
            <div class="drawer-note">
              <img src="/assets/lock-simple.svg" alt="" />
              <p>Private by default. Only you can see and collect these files.</p>
            </div>
          </section>
          <section class="upload-panel" aria-labelledby="upload-heading">
            <div class="upload-inner">
              <h2 id="upload-heading">Upload a PDF</h2>
              <p class="muted">
                Choose a file or drag it into the space below.
              </p>
              <form id="upload-form">
                <label class="drop-zone" id="drop-zone" for="file-input"
                  ><input
                    id="file-input"
                    name="file"
                    type="file"
                    accept=".pdf,application/pdf"
                    class="visually-hidden"
                  /><span class="upload-symbol"
                    ><img src="/assets/open-folder.webp" width="80" height="64" alt="" /></span
                  ><strong>Drop a PDF here</strong
                  ><span>or click to choose one</span
                  ><small id="upload-limit"
                    >PDF only · up to <?= $uploadLimitMb ?> MB</small
                  ></label
                >
                <div class="selected-file" id="selected-file" hidden>
                  <img src="/assets/file-pdf.svg" alt="" /><span
                    id="selected-name"
                  ></span
                  ><button
                    type="button"
                    id="clear-file"
                    aria-label="Remove selected file"
                  >
                    ×
                  </button>
                </div>
                <button
                  class="button button-primary upload-submit"
                  id="upload-submit"
                  type="submit"
                  disabled
                >
                  <span id="upload-submit-label">Upload PDF</span
                  ><img src="/assets/arrow-right.svg" alt="" />
                </button>
                <p
                  class="upload-status"
                  id="upload-status"
                  role="status"
                  aria-live="polite"
                >
                  Choose a PDF to get started.
                </p>
              </form>
              <div class="office-rule" id="collection-help">
                <p>
                  <strong>Before you collect</strong>Collecting a PDF removes
                  it from storage. Its database receipt stays. Issued
                  download links work for 60 seconds.
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
    <footer class="footer wrap">
      <span
        >Department of Files</span
      ><span>Private document storage.</span>
    </footer>
    <noscript
      ><p class="noscript">
        Enable JavaScript to sign in, upload PDFs and view your files.
      </p></noscript
    >
    <template id="file-template"
      ><li class="file-row">
        <span class="file-symbol"
          ><img src="/assets/file-pdf.svg" alt=""
        /></span>
        <div class="file-detail">
          <h3 class="file-name"></h3>
          <p class="file-meta"></p>
          <details class="receipt">
            <summary>Database receipt</summary>
            <dl>
              <dt>Record ID</dt>
              <dd class="receipt-id"></dd>
              <dt>Uploader ID</dt>
              <dd class="receipt-owner"></dd>
              <dt>MIME type</dt>
              <dd>application/pdf</dd>
              <dt>Storage key</dt>
              <dd class="receipt-key"></dd>
            </dl>
          </details>
        </div>
        <span class="availability"></span>
        <div class="file-action">
          <button class="button button-collect" type="button">
            <img src="/assets/download-simple.svg" alt="" /><span
              >Collect PDF</span
            ></button
          ><a class="retry-download" hidden>Retry issued link ↗</a>
        </div>
      </li></template
    >
  </body>
</html>
