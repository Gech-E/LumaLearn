import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const db = new PrismaClient();
const rights =
  'Original fictional demonstration content created for Pathway. Reuse permitted within this demo.';
const accessibility = { imagesHaveAlt: true, resourcesReviewed: true, headingsReviewed: true };
const criteria = [
  {
    id: 'organization',
    title: 'Clear organization',
    description: 'Uses descriptive folder and file names that a colleague can understand.',
    maxPoints: 4,
  },
  {
    id: 'communication',
    title: 'Useful email',
    description: 'Includes a clear subject, greeting, specific request, and courteous close.',
    maxPoints: 4,
  },
  {
    id: 'safety',
    title: 'Safe sharing',
    description: 'Explains how the recipient and shared information were checked.',
    maxPoints: 2,
  },
];

export async function seedDemo() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seed is disabled in production.');
  const password = process.env.DEMO_PASSWORD || 'PathwayDemo!2026';
  if (password.length < 12) throw new Error('DEMO_PASSWORD must contain at least 12 characters.');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  for (const [id, name] of [
    ['org-pathway', 'Pathway Learning — fictional demo'],
    ['org-other', 'Other organization — access-control demo'],
  ]) {
    await db.organization.upsert({ where: { id }, create: { id, name }, update: {} });
  }
  const people: {
    id: string;
    email: string;
    name: string;
    roles: Role[];
    org?: string;
    suspended?: boolean;
  }[] = [
    {
      id: 'user-learner',
      email: 'learner@pathway.local',
      name: 'Samira Tesfay (demo learner)',
      roles: ['LEARNER'],
    },
    {
      id: 'user-instructor',
      email: 'instructor@pathway.local',
      name: 'Daniel Mebrahtu (demo instructor)',
      roles: ['INSTRUCTOR'],
    },
    {
      id: 'user-admin',
      email: 'admin@pathway.local',
      name: 'Ruth Amanuel (demo administrator)',
      roles: ['ADMIN'],
    },
    {
      id: 'user-support',
      email: 'support@pathway.local',
      name: 'Aster Hailu (demo support)',
      roles: ['SUPPORT'],
    },
    {
      id: 'user-learner-two',
      email: 'learner2@pathway.local',
      name: 'Noah Bekele (demo learner)',
      roles: ['LEARNER'],
    },
    {
      id: 'user-unassigned',
      email: 'unassigned@pathway.local',
      name: 'Unassigned instructor (access-control demo)',
      roles: ['INSTRUCTOR'],
    },
    {
      id: 'user-suspended',
      email: 'suspended@pathway.local',
      name: 'Suspended learner (access-control demo)',
      roles: ['LEARNER'],
      suspended: true,
    },
    {
      id: 'user-other',
      email: 'other@pathway.local',
      name: 'Other organization learner (access-control demo)',
      roles: ['LEARNER'],
      org: 'org-other',
    },
  ];
  for (const person of people) {
    const user = await db.user.upsert({
      where: { email: person.email },
      create: {
        id: person.id,
        email: person.email,
        name: person.name,
        passwordHash,
        verifiedAt: new Date(),
      },
      update: {},
    });
    const organizationId = person.org || 'org-pathway';
    const membership = await db.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId } },
      create: { userId: user.id, organizationId, state: person.suspended ? 'SUSPENDED' : 'ACTIVE' },
      update: {},
    });
    for (const role of person.roles)
      await db.roleAssignment.upsert({
        where: { membershipId_role: { membershipId: membership.id, role } },
        create: { membershipId: membership.id, role },
        update: {},
      });
  }
  const courseId = 'course-digital-essentials';
  if (!(await db.course.findUnique({ where: { id: courseId } }))) {
    await db.$transaction(
      async (tx) => {
        await tx.course.create({
          data: {
            id: courseId,
            organizationId: 'org-pathway',
            slug: 'everyday-digital-skills',
            title: 'Everyday digital skills',
            summary:
              'Build confidence with files, email, and safe sharing. Practice useful tasks at your own pace, on a phone or computer.',
            subject: 'Digital skills',
            level: 'Beginner',
            language: 'en',
            format: 'Self paced',
            instructorName: 'Daniel Mebrahtu (demo instructor)',
            effortMinutes: 105,
            isPublic: true,
            freeEnrollment: true,
            assignments: { create: { userId: 'user-instructor' } },
          },
        });
        const version = await tx.courseVersion.create({
          data: {
            id: 'version-digital-1',
            courseId,
            number: 1,
            title: 'Everyday digital skills',
            description:
              'Learn a repeatable way to organize work, write a useful email, and check information before sharing it. This fictional demonstration course uses a small shop and community study group as examples. A reading path is available for every lesson; no video download is required.',
            outcomes: [
              'Organize files with descriptive names and folders.',
              'Write a clear email with a specific purpose.',
              'Choose safe sharing permissions and recognize a suspicious request.',
              'Prepare a small practical portfolio and improve it using a rubric.',
            ],
            prerequisites: [
              'Basic reading skills in English.',
              'Access to a phone or computer. No previous course required.',
            ],
            completionRule:
              'Complete all six reading lessons, pass both practices with at least 70%, and earn at least 70% on the practical assignment after feedback is released.',
          },
        });
        const modules = [
          {
            id: 'module-files',
            title: '1. Find and organize your work',
            lessons: [
              {
                id: 'activity-files',
                title: 'Give every file a useful home',
                objective: 'Create a simple folder structure and explain where a file belongs.',
                body: 'A folder groups related files. Start with the purpose of your work, then create only the folders you need. For a small shop, use a main folder called Shop records and subfolders called Sales, Stock, and Receipts. On an Android phone, open your Files app, choose a location, and use New folder. Your device may use a different label. Move one file at a time and check that it opens in the new location. A shortcut or recent-file list is not a backup.',
                example:
                  'Mariam receives a receipt for tea supplies. She saves it in Shop records / Receipts. She can find it next week without opening every photograph on her phone.',
                reflection:
                  'Choose one file you often struggle to find. Which folder name would help you find it again?',
              },
              {
                id: 'activity-names',
                title: 'Name files so they make sense later',
                objective: 'Choose a descriptive filename and preserve a separate backup.',
                body: 'A useful filename includes a topic and, when relevant, a date. Use a consistent order such as 2026-10-25_stock-count. Avoid names like final-final-new because they are hard to compare. Check the extension before renaming: .pdf and .jpg describe different file types. A backup is a separate copy in another safe location. Confirm that your backup opens before deleting any original. Do not put account passwords or identification numbers in filenames.',
                example:
                  'Instead of photo003.jpg, name a permitted receipt copy 2026-10-25_tea-receipt.jpg. Keep the original receipt and a separate backup according to your organization’s policy.',
                reflection:
                  'Rewrite one unclear filename. What information will make it useful a month from now?',
              },
            ],
          },
          {
            id: 'module-email',
            title: '2. Communicate clearly',
            lessons: [
              {
                id: 'activity-email',
                title: 'Write an email with one clear purpose',
                objective:
                  'Write a subject and short message that tell the reader what to do next.',
                body: 'Start with a subject that names the task. Add a greeting, the information the reader needs, and one clear request. Use short paragraphs. Include a date only when it is relevant and check the timezone for meetings. Close politely and add your name. Before sending, reread the message as if you are the recipient: can you tell what the sender needs?',
                example:
                  'Subject: Please confirm Tuesday stock delivery\nHello Hana,\nWe need six boxes of notebooks for our study group. Could you confirm whether delivery on Tuesday is possible? Please include the total cost.\nThank you,\nMariam',
                reflection: 'What one action would you like the reader of your next email to take?',
              },
              {
                id: 'activity-attachments',
                title: 'Check recipients and attachments',
                objective: 'Use a short checklist before sending a message.',
                body: 'Check the complete recipient address, not only the display name. Open every attachment and confirm that it is the intended version. Remove private information that the recipient does not need. Use Reply all only when everyone needs your answer. A copied link may require a sharing permission change; choose the smallest group that needs access. If a message asks for passwords, payment, or an urgent account change, verify it using a known contact route.',
                example:
                  'Before sending a stock list to Hana, Mariam checks Hana’s saved address, opens the stock file, and removes a sheet containing customer phone numbers. She shares only the required stock list.',
                reflection: 'Name two checks you can perform before pressing Send.',
              },
            ],
          },
          {
            id: 'module-safety',
            title: '3. Share safely and apply your skills',
            lessons: [
              {
                id: 'activity-sharing',
                title: 'Choose a safer sharing permission',
                objective: 'Choose view or edit access according to the task.',
                body: 'Sharing permissions control who can open or change a file. View access is usually enough when someone only needs to read. Edit access allows changes and should be given deliberately. Public links may be forwarded beyond the people you intended. Check access after sharing and remove access when the task ends. Never test permissions by sharing someone else’s private information. Use fictional information for this course.',
                example:
                  'A study group needs to read the weekly timetable. Mariam shares it with named members using view access. She gives edit access only to the person responsible for maintaining the timetable.',
                reflection:
                  'Who needs to read your next shared file, and who actually needs to edit it?',
              },
              {
                id: 'activity-checking',
                title: 'Pause and verify unexpected requests',
                objective: 'Recognize an unexpected request and verify it through a known channel.',
                body: 'Urgency, unfamiliar addresses, unexpected attachments, and requests for passwords are reasons to pause. No single sign proves that a message is harmful, but you can verify safely. Contact the sender through a phone number or website you already know. Do not use a contact route supplied only by the suspicious message. Keep your device updated, use a unique password for each account, and enable two-step sign-in when available. Ask for help without sharing your password.',
                example:
                  'A message says the study group must pay a fee within ten minutes. Mariam does not follow its link. She contacts the organizer using the number saved from an earlier meeting and learns that no payment is required.',
                reflection:
                  'Write the name of a trusted person or official help route you can use when a request is unclear.',
              },
            ],
          },
        ];
        for (const [position, m] of modules.entries()) {
          await tx.module.create({
            data: { id: m.id, courseVersionId: version.id, title: m.title, position },
          });
          for (const [lessonPosition, lesson] of m.lessons.entries())
            await tx.activityVersion.create({
              data: {
                ...lesson,
                moduleId: m.id,
                position: lessonPosition,
                kind: 'LESSON',
                estimatedMinutes: 8,
                resources:
                  lesson.id === 'activity-files'
                    ? [
                        {
                          title: 'A simple file organization checklist',
                          text: '1. Group related files in a clearly named folder.\n2. Give each file a descriptive name.\n3. Add a date when it helps you find the right version.\n4. Open the saved file once to check it.\n5. Keep a backup of important work.\n\nThis is original, fictional learning content created for the Pathway demonstration.',
                          accessible: true,
                          offlineAllowed: true,
                        },
                      ]
                    : [],
                accessibility,
                rights,
                prerequisiteIds: [],
                offlineAllowed: true,
              },
            });
        }
        const practices = [
          {
            id: 'activity-file-practice',
            moduleId: 'module-files',
            title: 'Practice: organize a shop receipt',
            questions: [
              {
                kind: 'SINGLE' as const,
                prompt: 'Which filename is most useful for a receipt dated 25 October 2026?',
                options: ['new-final.jpg', '2026-10-25_tea-receipt.jpg', 'photo1.jpg'],
                answer: ['2026-10-25_tea-receipt.jpg'],
                explanation:
                  'The date and topic help you identify and sort the receipt without opening it.',
              },
              {
                kind: 'MULTIPLE' as const,
                prompt: 'Choose both useful backup habits.',
                options: [
                  'Keep a separate copy in a safe location',
                  'Check that the backup opens',
                  'Delete the original before checking',
                  'Put all account passwords in filenames',
                ],
                answer: ['Keep a separate copy in a safe location', 'Check that the backup opens'],
                explanation:
                  'A separate, readable copy makes recovery possible. Check it before changing or removing your original.',
              },
              {
                kind: 'SHORT_TEXT' as const,
                prompt: 'What is the common word for a container that groups related files?',
                options: [],
                answer: ['folder', 'a folder'],
                explanation: 'A folder groups related files so that you can find them by purpose.',
              },
            ],
          },
          {
            id: 'activity-safety-practice',
            moduleId: 'module-safety',
            title: 'Practice: make a safer sharing decision',
            questions: [
              {
                kind: 'SINGLE' as const,
                prompt:
                  'A colleague only needs to read a timetable. Which permission fits the task?',
                options: [
                  'View access for that colleague',
                  'Public edit access',
                  'Your account password',
                ],
                answer: ['View access for that colleague'],
                explanation:
                  'Named view access gives the colleague what they need while limiting unintended changes.',
              },
              {
                kind: 'MULTIPLE' as const,
                prompt: 'Choose both useful checks before sending an email attachment.',
                options: [
                  'Check the complete recipient address',
                  'Open the attachment and check its contents',
                  'Send first and check later',
                  'Assume a display name proves identity',
                ],
                answer: [
                  'Check the complete recipient address',
                  'Open the attachment and check its contents',
                ],
                explanation: 'Checking the actual address and file reduces mistaken sharing.',
              },
              {
                kind: 'SHORT_TEXT' as const,
                prompt:
                  'Before acting on an unexpected urgent request, should you verify or ignore verification? Type “verify”.',
                options: [],
                answer: ['verify'],
                explanation:
                  'Verify through a contact route you already trust, rather than a link or number supplied by the unexpected message.',
              },
            ],
          },
        ];
        for (const p of practices)
          await tx.activityVersion.create({
            data: {
              id: p.id,
              moduleId: p.moduleId,
              position: 2,
              title: p.title,
              kind: 'PRACTICE',
              objective: 'Apply the examples and use the explanations to improve your decisions.',
              body: 'Answer three questions. Your score is calculated on the server. You can try up to three times; feedback appears after you submit. Ask your instructor if you need another attempt.',
              example:
                'Read the task carefully. For a question that asks for both choices, select exactly the two useful actions.',
              reflection: 'Which explanation helped you most?',
              estimatedMinutes: 10,
              rights,
              accessibility,
              resources: [],
              offlineAllowed: false,
              prerequisiteIds: [],
              assessment: {
                create: {
                  maxAttempts: 3,
                  passPercent: 70,
                  feedbackRelease: 'AFTER_SUBMIT',
                  questions: {
                    create: p.questions.map((q, position) => ({ ...q, position, points: 1 })),
                  },
                },
              },
            },
          });
        await tx.activityVersion.create({
          data: {
            id: 'activity-portfolio',
            moduleId: 'module-safety',
            position: 3,
            title: 'Your practical portfolio',
            kind: 'ASSIGNMENT',
            objective:
              'Demonstrate file organization, clear communication, and safe sharing in one small task.',
            body: 'Use fictional information to prepare a portfolio. Describe a folder structure for a small shop or study group and give three example filenames. Write an email asking a colleague to review one file. Explain how you checked the recipient and selected sharing permissions. You may write your response here, provide an HTTPS link, or attach an allowed file. Read the rubric before submitting. Save a draft first; submission is confirmed only when you receive a receipt.',
            example:
              'Folder: Study group / Timetables. File: 2026-10-25_weekly-timetable.pdf. Email subject: Please check next week’s timetable. Sharing: named view access for group members, edit access for the organizer.',
            reflection: 'What would you change after receiving feedback?',
            estimatedMinutes: 35,
            resources: [],
            accessibility,
            rights,
            prerequisiteIds: [],
            offlineAllowed: false,
            rubric: { create: { criteria, passPercent: 70 } },
          },
        });
        await tx.courseVersion.update({
          where: { id: version.id },
          data: { state: 'PUBLISHED', publishedAt: new Date() },
        });
        await tx.course.update({
          where: { id: courseId },
          data: { currentVersionId: version.id, state: 'PUBLISHED' },
        });
        await tx.auditEvent.create({
          data: {
            actorId: 'user-instructor',
            organizationId: 'org-pathway',
            action: 'course.published',
            objectId: courseId,
            detail: { versionId: version.id, source: 'fictional-demo-seed' },
          },
        });
        const enrollment = await tx.enrollment.create({
          data: {
            id: 'enrollment-demo-learner',
            userId: 'user-learner',
            courseId,
            courseVersionId: version.id,
          },
        });
        await tx.activityCompletion.create({
          data: { enrollmentId: enrollment.id, activityId: 'activity-files', state: 'COMPLETED' },
        });
        const text =
          'Fictional example portfolio: Shop records / Receipts / tea-receipt.jpg. Email: Hello Hana, please review the attached receipt. Thank you, Samira. I chose a private link.';
        const submission = await tx.submission.create({
          data: {
            id: 'submission-demo-portfolio',
            enrollmentId: enrollment.id,
            activityId: 'activity-portfolio',
            state: 'REVISION_REQUESTED',
            text,
            assetIds: [],
            frozenRubric: criteria,
            requestId: 'demo-initial-portfolio',
            receipt: 'PW-DEMO-PORTFOLIO-1',
            submittedAt: new Date(),
          },
        });
        await tx.submissionReceipt.create({
          data: {
            submissionId: submission.id,
            requestId: 'demo-initial-portfolio',
            receipt: 'PW-DEMO-PORTFOLIO-1',
            revision: 1,
            snapshot: { text, link: null, assetIds: [], rubric: criteria },
          },
        });
        const feedback =
          'Your folders are easy to follow and your greeting is courteous. For your revision, add dates to the filenames, give the email a clear subject, and explain how you checked Hana’s full address. Then say who can view and who can edit the file. This is fictional example feedback; you can replace the draft with your own practice work.';
        const grade = await tx.grade.create({
          data: {
            submissionId: submission.id,
            graderId: 'user-instructor',
            revision: 1,
            submissionRevision: 1,
            criteriaScores: [
              { criterionId: 'organization', points: 2 },
              { criterionId: 'communication', points: 2 },
              { criterionId: 'safety', points: 1 },
            ],
            score: 50,
            passed: false,
            feedback,
            revisionRequested: true,
            releasedAt: new Date(),
            feedbackHistory: { create: { actorId: 'user-instructor', feedback } },
          },
        });
        await tx.notification.create({
          data: {
            userId: 'user-learner',
            organizationId: 'org-pathway',
            eventId: `grade:${grade.id}`,
            title: 'Example feedback is ready',
            body: 'Open Your practical portfolio to read the fictional instructor feedback and try a revision.',
          },
        });
      },
      { timeout: 30000 },
    );
  }
  console.log(
    'Fictional Pathway demo seeded. Existing accounts and learning records were preserved. Privileged accounts must set up MFA at first sign-in.',
  );
}

if (require.main === module)
  seedDemo()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
