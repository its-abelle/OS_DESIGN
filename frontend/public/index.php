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
    <meta name="theme-color" content="#183524" />
    <meta
      name="description"
      content="A happy little home for your PDFs. File them, find them, and get on with your day."
    />
    <title>Department of Files — Please file responsibly.</title>
    <link rel="icon" href="/assets/file-pdf.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="module" src="/app.js"></script>
  </head>
  <body data-authenticated="false">
    <a class="skip-link" href="#main">Skip to the file office</a>
    <header class="masthead wrap">
      <a class="brand" href="/" aria-label="Department of Files home"
        ><span class="brand-mark" aria-hidden="true"
          ><img src="/assets/file-pdf.svg" alt="" /></span
        ><span
          >DEPARTMENT<br />OF FILES<span class="brand-caption"
            >A little order. A lot less paperwork.</span
          ></span
        ></a
      >
      <div class="session-controls" id="session-controls" hidden>
        <span class="user-label"
          ><i class="square-dot" aria-hidden="true"></i
          ><span id="user-name"></span></span
        ><button class="button button-outline" id="logout" type="button">
          <img src="/assets/sign-out.svg" alt="" />Sign out
        </button>
      </div>
      <span class="office-note" id="office-note"
        >NO PRINTING REQUIRED.<br />THE TREES SEND THEIR REGARDS.</span
      >
    </header>
    <main id="main" class="wrap" tabindex="-1">
      <section
        id="auth-view"
        class="entrance"
        aria-labelledby="welcome-heading"
      >
        <div class="welcome-copy">
          <p class="section-label">YOUR FRIENDLY NEIGHBOURHOOD FILE OFFICE</p>
          <h1 id="welcome-heading">
            YOUR PDFs.<br />A LITTLE<br /><em>LESS CHAOS.</em>
          </h1>
          <p class="intro">
            A happy little home for your PDFs. Drop one in, collect it later,
            and leave the filing to us.
          </p>
          <div class="clerk-scene" aria-hidden="true">
            <img class="welcome-mascot" src="/assets/folder-friend.webp"
              width="280" height="220" alt="" fetchpriority="high" />
            <div class="speech-note">Big smile.<br />Tiny workload.</div>
            <span class="office-seal">LESS MESS.<br />MORE YES.</span>
          </div>
        </div>
        <section class="auth-panel" aria-labelledby="auth-heading">
          <div class="panel-tab">COME ON IN.</div>
          <div class="auth-inner">
          <div class="mode-switch" role="group" aria-label="Account action">
              <button type="button" id="login-mode" aria-pressed="true">
                Sign in</button
              ><button type="button" id="register-mode" aria-pressed="false">
                Create account
              </button>
            </div>
            <h2 id="auth-heading">YOUR DESK IS READY.</h2>
            <p id="auth-description" class="muted">
              Sign in. Your PDFs have saved you a seat.
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
                  placeholder="the_file_person"
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
                  placeholder="you@university.ac.ke"
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
            <p class="auth-footnote">
              <img src="/assets/lock-simple.svg" alt="" />Your account. Your
              files. No communal cupboard.
            </p>
          </div>
        </section>
      </section>
      <section id="workspace" aria-labelledby="workspace-heading" hidden>
        <div class="workspace-heading">
          <div>
            <p class="section-label" id="greeting">YOUR PERSONAL FILE OFFICE</p>
            <h1 id="workspace-heading">LET’S FILE SOMETHING.</h1>
            <p>
              A little space for your files. A little less on your mind.
            </p>
          </div>
          <div class="desk-clerk" id="desk-clerk" aria-hidden="true">
            <img class="desk-folder" src="/assets/folder-friend.webp" width="144" height="112" alt="" />
            <img class="desk-stamp" src="/assets/filed-stamp.webp" width="96" height="96" alt="" />
          </div>
        </div>
        <div class="notice" id="notice" role="status" aria-live="polite" hidden>
          <img id="notice-illustration" class="notice-illustration" src="/assets/filed-stamp.webp" width="48" height="48" alt="" aria-hidden="true" hidden />
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
          <section class="upload-panel" aria-labelledby="upload-heading">
            <div class="panel-tab">INCOMING PAPERWORK</div>
            <div class="upload-inner">
              <h2 id="upload-heading">FILE IT HERE.</h2>
              <p class="muted">
                One PDF at a time. We’re an office, not a miracle.
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
                    ><img src="/assets/open-folder.webp" width="100" height="80" alt="" /></span
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
                  <span id="upload-submit-label">File this PDF</span
                  ><img src="/assets/arrow-right.svg" alt="" />
                </button>
                <p
                  class="upload-status"
                  id="upload-status"
                  role="status"
                  aria-live="polite"
                >
                  No file selected. The clerk is on standby.
                </p>
              </form>
              <div class="office-rule">
                <span class="rule-number">!</span>
                <p>
                  <strong>A small office rule</strong>Collecting a PDF removes
                  it from the drawer. Its database receipt stays. Issued
                  download links work for 60 seconds.
                </p>
              </div>
            </div>
          </section>
          <section class="files-panel" aria-labelledby="files-heading">
            <div class="files-heading">
              <div>
                <h2 id="files-heading">YOUR FILE DRAWER</h2>
                <p id="record-count" class="muted">Opening the drawer…</p>
              </div>
              <button class="button button-small" id="refresh" type="button">
                <img src="/assets/arrows-clockwise.svg" alt="" /><span
                  >Refresh</span
                >
              </button>
            </div>
            <p class="list-error" id="list-error" role="alert" hidden></p>
            <div class="list-loading" id="list-loading" role="status">
              <span>Checking the filing cabinet…</span><i></i><i></i><i></i>
            </div>
            <div class="empty-state" id="empty-state" hidden>
              <span class="empty-icon" aria-hidden="true"
                ><img src="/assets/open-folder.webp" width="176" height="144" alt=""
              /></span>
              <h3>NOTHING TO MISPLACE. YET.</h3>
              <p>
                Every organised person starts somewhere.<br />Your first PDF will feel right at home.
              </p>
              <button class="text-button" type="button" id="empty-choose">
                Choose your first PDF →
              </button>
            </div>
            <ul
              class="file-list"
              id="file-list"
              aria-label="Your uploaded files"
            ></ul>
            <button
              class="button load-more"
              id="load-more"
              type="button"
              hidden
            >
              Open the next drawer →
            </button>
            <div class="drawer-note">
              <img src="/assets/lock-simple.svg" alt="" />
              <p>A drawer with your name on it. Only you can see and collect these files.</p>
            </div>
          </section>
        </div>
      </section>
    </main>
    <footer class="footer wrap">
      <span
        >DEPARTMENT OF FILES <span aria-hidden="true">/</span> YOUR LITTLE
        FILE OFFICE</span
      ><span>Less paperwork. More peace of mind.</span>
    </footer>
    <noscript
      ><p class="noscript">
        Enable JavaScript to sign in, file PDFs and view your drawer.
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
        <div class="file-action">
          <span class="availability"></span
          ><button class="button button-collect" type="button">
            <img src="/assets/download-simple.svg" alt="" /><span
              >Collect PDF</span
            ></button
          ><a class="retry-download" hidden>Retry issued link ↗</a>
        </div>
      </li></template
    >
  </body>
</html>
