import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { publicPage } from "@/app/metadata";

export const metadata: Metadata = publicPage("/privacy", {
  title: "Privacy",
  description: `What ${BRAND.name} keeps about you and your household, who processes it, and how to delete it.`,
});

// Plain English and short. Every name comes from BRAND; the processors are named as the
// companies they are. Nothing here promises the operator can't see data: it says what the
// admin screen shows and when anyone looks further.
export default function Privacy() {
  return (
    <main>
      <div className="s-wrap">
        <header className="s-page-head">
          <span className="s-key">Privacy</span>
          <h1 className="s-h1">What {BRAND.name} keeps, and what it doesn&apos;t do.</h1>
          <p className="s-lede">
            {BRAND.name} stores the bills a household shares so everyone can see what they owe. This page says what that
            involves, in plain words.
          </p>
        </header>
      </div>

      <section className="s-section" aria-labelledby="collect-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="collect-title">
              What we collect
            </h2>
          </div>
          <ol className="s-notes s-notes-plain">
            <li>
              <h3 className="s-h3">Your account.</h3>
              <p>Your email address, which is how you sign in, and the name you give your household.</p>
            </li>
            <li>
              <h3 className="s-h3">Your household&apos;s records.</h3>
              <p>Its members, its bill types, each bill&apos;s amounts and dates, who paid what and when, and the settings you choose.</p>
            </li>
            <li>
              <h3 className="s-h3">Statements and documents.</h3>
              <p>The PDFs attached to bills and any documents a household uploads, stored privately for that household.</p>
            </li>
            <li>
              <h3 className="s-h3">The waitlist.</h3>
              <p>
                If you joined the list before launch: your email address, when you joined, and a hash of your IP address
                (to clear out spam). It&apos;s used for one note when {BRAND.name} opens.
              </p>
            </li>
            <li>
              <h3 className="s-h3">Email delivery logs.</h3>
              <p>
                For every email we send: what kind it was, whether it went out, when, and a hash of the address. Never the
                message itself.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="s-section" aria-labelledby="processors-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="processors-title">
              Who processes it
            </h2>
          </div>
          <div>
            <p className="s-prose">
              Three companies run the pieces for us: <strong>Vercel</strong> hosts the app and stores the uploaded files,{" "}
              <strong>Neon</strong> runs the database, and <strong>Resend</strong> delivers the email. Each handles data only to
              provide that service.
            </p>
          </div>
        </div>
      </section>

      <section className="s-section" aria-labelledby="not-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="not-title">
              What we don&apos;t do
            </h2>
          </div>
          <div>
            <p className="s-prose">
              No ads, and we never sell or share your data. {BRAND.name} never holds or moves money: it records that a payment
              happened, and nothing more.
            </p>
            <p className="s-prose">
              Cookies are for signing in only: one keeps you signed in, one remembers which household you opened last. There is
              no tracking.
            </p>
          </div>
        </div>
      </section>

      <section className="s-section" aria-labelledby="operator-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="operator-title">
              The operator
            </h2>
          </div>
          <div>
            <p className="s-prose">
              To run the service, the operator has an admin screen that shows household metadata and counts: names, settings,
              how many members and bills, when things last happened, whether email is going out, and each member&apos;s name
              and email address. It shows no bill amounts or statements. From it the operator can delete an account or a
              household outright, which is how abuse or a request sent to the contact address gets handled.
            </p>
            <p className="s-prose">
              The operator also has technical access to the database and file storage for maintenance, and looks at a
              household&apos;s bills or statements only to fix a problem that household reports.
            </p>
            <p className="s-prose">
              The operator may email account holders about the service itself: a change to how it works, something that
              needs doing, or that it&apos;s open. Those emails carry an unsubscribe link, and you can turn them off any time
              under Account (&ldquo;Updates about {BRAND.name}&rdquo;). Sign-in codes and notices about your own household
              aren&apos;t affected. Nothing promotional is sent.
            </p>
          </div>
        </div>
      </section>

      <section className="s-section" aria-labelledby="delete-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="delete-title">
              Deleting your data
            </h2>
          </div>
          <div>
            <p className="s-prose">
              A household deletes itself from its Settings page: its admins agree to it, there is a week to change your mind,
              and then every bill, payment, statement and document is gone. To leave a household without deleting it, use
              &ldquo;Leave&rdquo; on the same page.
            </p>
          </div>
        </div>
      </section>

      <section className="s-section" aria-labelledby="contact-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="contact-title">
              Contact
            </h2>
          </div>
          <div>
            <p className="s-prose">
              Questions about any of this go to <a className="s-link" href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.
            </p>
            <p className="s-prose">
              {BRAND.name} is a trade name of {BRAND.legalName}.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
