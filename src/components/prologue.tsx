/**
 * The prologue of the world — the first thing both the party and the DM see
 * on the front page. Prose lives here rather than in the database so it renders
 * before a single query returns and can never be archived by accident.
 */

const paragraphStyle: React.CSSProperties = {
  margin: "0 0 0.85rem",
  lineHeight: 1.7,
  fontSize: "0.9375rem",
};

const phenomenonTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text)",
};

export function Prologue() {
  return (
    <section
      aria-labelledby="prologue-heading"
      className="card"
      style={{ padding: "1.5rem 1.75rem", marginBottom: "2.5rem" }}
    >
      <h2
        id="prologue-heading"
        className="font-display"
        style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}
      >
        Prologue — The Sundering of Asetheria
      </h2>
      <p
        style={{
          fontSize: "0.8125rem",
          color: "var(--text-faint)",
          fontStyle: "italic",
          marginBottom: "1rem",
        }}
      >
        As the chroniclers of Deiperdeum tell it.
      </p>

      <p style={paragraphStyle}>
        Two hundred years ago, the continent of Asetheria was torn asunder by
        war. Dragons and giants, gods and demigods, and creatures out of every
        realm that touches this one clashed in a struggle that was no longer
        about supremacy but about sheer survival. At the head of the armies of
        mortalkind marched three figures — one from each of the continent&rsquo;s
        dominant empires — remembered now as the{" "}
        <strong>Three Enigmas of Humanity</strong>. The war reshaped the very
        land: mountains cracked, coastlines drowned, and the scars it left
        behind endure to this day.
      </p>

      <p style={paragraphStyle}>
        As the fighting wore on, magic ran rampant, wild and ownerless, wreaking
        havoc across the continent until the weave of the world itself gave way.
        The cataclysm that followed opened a <strong>rift</strong> — a tear in
        the fabric of reality. A meteor plummeted burning from the wound in the
        sky, and where it shattered against the earth its fragments scattered
        across Asetheria; they are called the <strong>Primordial Stones</strong>,
        and they are hunted still. With the rift came a new terror: monsters no
        chronicle had a name for, pouring forth to join the chaos that birthed
        them.
      </p>

      <p style={paragraphStyle}>
        Exhausted and desperate, the warring powers convened in the lone city
        left standing outside the three kingdoms, and there — amidst rubble and
        ash — they brokered an uneasy peace. That city became{" "}
        <strong>Deiperdeum</strong>, <em>the city the gods watch over</em>: a
        neutral ground where every race is accepted, governed by three
        representatives from each empire and five elected senators, and grown
        since into a bustling crossroads of trade and diplomacy.
      </p>

      <details>
        <summary
          style={{
            cursor: "pointer",
            fontSize: "0.875rem",
            color: "var(--accent)",
            marginBottom: "0.85rem",
          }}
        >
          Read on — the Three Empires, and the phenomena that followed
        </summary>

        <p style={paragraphStyle}>
          The <strong>Imperium Invicta</strong>, renowned for impregnable walls
          and disciplined legions, holds sway over vast plains and fertile
          farmland. Its capital, Aeterna, crowns a hill that overlooks the
          heartland, with three great cities arrayed along its precipice; the
          dense Araucaria Forest stands between the Imperium and its old rival
          across the trees.
        </p>

        <p style={paragraphStyle}>
          The <strong>Hellenoria Empire</strong> prizes the individual — and the
          uncanny coordination of individuals. Its warriors are famous for
          fighting with synergistic precision, each one a soloist in a shared
          score. From the capital of Hellarchon, nestled beneath the Oros,
          Kylnin, and Olympus ranges to the north and flanked by the Aeolus
          Abyss and the Nereid&rsquo;s Veil Seas, Hellenoria rules the waves;
          on open water it has never met its equal.
        </p>

        <p style={paragraphStyle}>
          The <strong>Acheaoria Empire</strong> is a confederation of
          semi-nomadic tribes that roam the Elysian Plateau, celebrated for
          artistry and craftsmanship and feared for everything else. Its
          standing army, the <em>Immortals</em>, numbers ten thousand exactly —
          and is replenished the instant any of them falls. Set between deserts
          and rocky plains, Acheaoria deals in what outlasts steel: ruthless
          assassins, shrewd traders, and the gathering and selling of secrets.
          Its capital, Persemenid, is the center point of all information on the
          continent — it is said that nothing is whispered anywhere that is not
          repeated there by morning.
        </p>

        <p style={paragraphStyle}>
          Thus, amidst ancient mountains, sprawling forests, and tumultuous
          seas, Asetheria has borne witness to the rise and fall of empires —
          each leaving its mark upon the land, and each still shaping the course
          of history two centuries on.
        </p>

        <h3
          className="label"
          style={{ margin: "1.25rem 0 0.75rem" }}
        >
          Phenomena of the present age
        </h3>

        <p style={paragraphStyle}>
          <span style={phenomenonTitleStyle}>
            1. The Lingering Divine Resonance.
          </span>{" "}
          The clash of divine powers in the ancient war left residual
          interdimensional energies soaked into the fabric of reality.
          Remnants of the immense magical forces the combatants unleashed,
          these energies still resonate with the unstable rifts between
          dimensions that persist in the war&rsquo;s aftermath — a struck bell
          that has never quite stopped ringing.
        </p>

        <p style={paragraphStyle}>
          <span style={phenomenonTitleStyle}>2. The Echoes of the Rift.</span>{" "}
          When the residual energies surge, temporary rifts tear open and
          echoes of the past spill into the present — moments of the ancient
          battle replaying themselves upon the land. These rifts serve as
          conduits for interdimensional travel, carrying creatures and
          phenomena through from distant planes of existence, and closing
          again without warning or apology.
        </p>

        <p style={paragraphStyle}>
          <span style={phenomenonTitleStyle}>
            3. The Mystery of the Miracle Born.
          </span>{" "}
          The disappearance of the <em>Miracle Born</em> — the first of the
          Singularities — is bound up with the Echoes of the Rift in ways no
          scholar has untangled. Some hold that a being of such enigmatic
          nature and unparalleled power must be connected to the rifts&rsquo;
          very creation; others believe that solving the riddle of the Miracle
          Born&rsquo;s vanishing is the key to understanding the Echoes — and,
          perhaps, to ending them.
        </p>

        <p style={paragraphStyle}>
          <span style={phenomenonTitleStyle}>
            4. The Ancient Pact&rsquo;s Legacy.
          </span>{" "}
          The truce sworn at the war&rsquo;s end did not merely stop the
          fighting — it settled into the world. The energies of the conflict
          and of the peace that followed have woven themselves together into a
          delicate balance, and when that balance is disturbed by a surge of
          interdimensional energy, the rifts and their echoes answer. Every
          tremor in the present carries the signature of the promise made two
          hundred years ago — the legacy of the ancient pact, still binding,
          still owed.
        </p>
      </details>
    </section>
  );
}
