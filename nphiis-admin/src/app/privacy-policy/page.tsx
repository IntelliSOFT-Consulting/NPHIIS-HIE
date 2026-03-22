import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | NPHIIS Admin',
  description: 'National Public Health Intelligence Information System (NPHIIS) Privacy Policy - IntelliSOFT Consulting Limited',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium mb-8"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to login
        </Link>

        <article className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 sm:px-8 py-8 sm:py-10">
            <h1 className="text-2xl font-bold text-gray-900 mb-8">
              National Public Health Intelligence Information System (NPHIIS) Privacy Policy
            </h1>

            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Introduction</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 text-sm leading-relaxed">
                <li>We are committed to safeguarding the privacy of our product and service users (&quot;Clients&quot;).</li>
                <li>This policy applies where we are acting as a data controller with respect to the personal data of our Clients, in other words, where we determine the purposes and means of the processing of that personal data.</li>
                <li>We may collect personal data of our Clients by using cookies on our application. By using our application and agreeing to this policy, you consent to our use of cookies in accordance with the terms of this policy.</li>
                <li>Our application incorporates privacy controls which affect how we will process your personal data. By using the privacy controls, you can specify whether you would like to receive direct marketing communications and limit the publication of your information. You can access the privacy controls via [URL].</li>
                <li>In this policy, &quot;we&quot;, &quot;us&quot; and &quot;our&quot; refer to IntelliSOFT Consulting Limited</li>
                <li>It is your responsibility to check this page periodically to see if any terms have been changed or modified. Your continued use of the application constitutes your acceptance of any updates to this Privacy Policy.</li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">COLLECTION AND USE OF DATA</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 text-sm leading-relaxed">
                <li>We may collect some personal information when you use the application. This information can include your name, gender, date of birth, specialty, addresses, telephone numbers, email addresses.</li>
                <li>We may process information that you provide to us for the purpose of subscribing to our email notifications, company and product updates, and/or newsletters (&quot;notification data&quot;). The notification data may be processed for the purposes of sending you the relevant notifications and/or newsletters. The legal basis for this processing is our legitimate interests, namely the proper administration of our website and business.</li>
                <li>We may process information contained in or relating to any communication that you send to us (&quot;correspondence data&quot;). The correspondence data may include the communication content and metadata associated with the communication.</li>
                <li>We may process any of your personal data identified in this policy where necessary for the establishment, exercise or defense of legal claims, whether in court proceedings or in an administrative or out-of-court procedure. The legal basis for this processing is our legitimate interests, namely the protection and assertion of our legal rights, your legal rights and the legal rights of others.</li>
                <li>In addition to the specific purposes for which we may process your personal data set out in this Section, we may also process any of your personal data where such processing is necessary for compliance with a legal obligation to which we are subject, or in order to protect your vital interests or the vital interests of another natural person.</li>
                <li>We do not directly collect any special categories of personal data about you. This includes details about your race or ethnicity, religious or philosophical beliefs, sex life, sexual orientation, political opinions, trade union membership, genetic and biometric data. Nor do we collect any information about criminal convictions and offences.</li>
                <li>We will not collect any personal information about you without your permission. We respect your right to privacy and commit to protecting the personal information we collect from you.</li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">YOUR RIGHTS</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 text-sm leading-relaxed">
                <li>In this Section, we have summarized the rights that you have under data protection law. Some of the rights are complex, and not all of the details have been included in our summaries. Accordingly, you should read the relevant laws and guidance from the regulatory authorities for a full explanation of these rights.</li>
                <li>Your principal rights under data protection law are:
                  <ol className="list-[lower-roman] list-inside mt-2 ml-4 space-y-1">
                    <li>the right to access;</li>
                    <li>the right to rectification;</li>
                    <li>the right to erasure;</li>
                    <li>the right to restrict processing;</li>
                    <li>the right to object to processing;</li>
                    <li>the right to data portability;</li>
                    <li>the right to complain to a supervisory authority; and</li>
                    <li>the right to withdraw consent.</li>
                  </ol>
                </li>
                <li>You have the right to confirm as to whether or not we process your personal data and, where we do, access to the personal data, together with certain additional information. That additional information includes details of the purposes of the processing, the categories of personal data concerned and the recipients of the personal data. Providing the rights and freedoms of others are not affected, we will supply to you a copy of your personal data free of charge.</li>
                <li>You have the right to have any inaccurate personal data about you rectified and, taking into account the purposes of the processing, to have any incomplete personal data about you completed.</li>
                <li>In some circumstances you have the right to the erasure of your personal data without undue delay. Those circumstances include: the personal data are no longer necessary in relation to the purposes for which they were collected or otherwise processed; you withdraw consent to consent-based processing; you object to the processing under certain rules of applicable data protection law; the processing is for direct marketing purposes; and the personal data have been unlawfully processed. However, there are exclusions. The general exclusions include where processing is necessary: for exercising the right of freedom of expression and information; for compliance with a legal obligation; or for the establishment, exercise or defense of legal claims.</li>
                <li>In some circumstances you have the right to restrict the processing of your personal data. Those circumstances are: you contest the accuracy of the personal data; processing is unlawful but you oppose erasure; we no longer need the personal data for the purposes of our processing, but you require personal data for the establishment, exercise or defense of legal claims; and you have objected to processing, pending the verification of that objection. Where processing has been restricted on this basis, we may continue to store your personal data. However, we will only otherwise process it: with your consent; for the establishment, exercise or defense of legal claims; for the protection of the rights of another natural or legal person; or for reasons of important public interest.</li>
                <li>You have the right to object to our processing of your personal data on grounds relating to your particular situation, but only to the extent that the legal basis for the processing is that the processing is necessary for: the performance of a task carried out in the public interest or in the exercise of any official authority vested in us; or the purposes of the legitimate interests pursued by us or by a third party. If you make such an objection, we will cease to process the personal information unless we can demonstrate compelling legitimate grounds for the processing which override your interests, rights and freedoms, or the processing is for the establishment, exercise or defense of legal claims.</li>
                <li>You have the right to object to our processing of your personal data for direct marketing purposes (including profiling for direct marketing purposes). If you make such an objection, we will cease processing your personal data for this purpose.</li>
                <li>To the extent that the legal basis for our processing of your personal data is:
                  <ol className="list-[lower-roman] list-inside mt-2 ml-4 space-y-1">
                    <li>consent; or</li>
                    <li>that the processing is necessary for the performance of a contract to which you are party or in order to take steps at your request prior to entering into a contract, and such processing is carried out by automated means, you have the right to receive your personal data from us in a structured, commonly used and machine-readable format. However, this right does not apply where it would adversely affect the rights and freedoms of others.</li>
                  </ol>
                </li>
                <li>If you consider that our processing of your personal information infringes data protection laws, you have a legal right to lodge a complaint with a supervisory authority responsible for data protection which for Kenya, is the Office of the Data Protection Commissioner (<a href="https://www.odpc.go.ke/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">https://www.odpc.go.ke/</a>).</li>
                <li>To the extent that the legal basis for our processing of your personal information is consent, you have the right to withdraw that consent at any time. Withdrawal will not affect the lawfulness of processing before the withdrawal.</li>
                <li>You may exercise any of your rights in relation to your personal data by contacting us as set out below.</li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">DATA RETENTION AND DELETION</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 text-sm leading-relaxed">
                <li>We will keep your personal data after we have finished our contractual arrangements with you. We will do so for one of these reasons:
                  <ul className="list-disc list-inside mt-2 ml-4 space-y-1">
                    <li>To respond to any questions, complaints or claims made by you or on your behalf;</li>
                    <li>To keep records required by law; and</li>
                    <li>To re-engage with you.</li>
                  </ul>
                  We will not retain your data for longer than necessary for the purposes set out in this policy. When it is no longer necessary to retain your personal data, we will delete or anonymise it. We will share personal information with authorities if required by applicable law.
                </li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">INFORMATION SHARING</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 text-sm leading-relaxed">
                <li>We may disclose your personal data to any member of our group of companies (this means our subsidiaries, our ultimate holding company and all its subsidiaries) insofar as reasonably necessary for the purposes, and on the legal bases, set out in this policy.</li>
                <li>We may give third-parties access to personal information, and may use it on our behalf strictly for the purposes for which they are engaged. We minimise the amount of personal data that is utilised by these services, and we have ensured that these services process your data in accordance with the appropriate regulations.</li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">YOUR RIGHTS IN RELATION TO PERSONAL DATA</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 text-sm leading-relaxed">
                <li>We fully respect your right to access and control your personal data. You can access, modify or delete your personal information, or delete your account at any time. You may request the content, amendment, transfer or removal of your data from our database by sending an email to Support@intellisoftkenya.com &quot;Data Request&quot;.</li>
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">INFORMATION SECURITY</h2>
              <p className="text-gray-700 text-sm leading-relaxed">
                We are committed to investing in and running the most secure systems we can, to protect your data to the best of our abilities at all times. We retain and store your information securely using digital technology and our secure servers.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">AMENDMENTS</h2>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 text-sm leading-relaxed">
                <li>We may update this policy from time to time by publishing a new version on our website.</li>
                <li>You should check this page occasionally to ensure you are happy with any changes to this policy.</li>
                <li>We may notify you of changes to this policy by email.</li>
              </ol>
            </section>
          </div>
        </article>
      </div>
    </div>
  );
}
