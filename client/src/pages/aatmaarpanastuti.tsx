import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, Volume2, VolumeX, Download, Heart } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

// Sanskrit verses of Aatmaarpanastuti by Appayya Dikshita
const verses = [
  {
    sanskrit: `कस्ते बोद्धुं प्रभवति परं देवदेव प्रभावं
यस्मादित्थं विविधरचना सृष्टिरेषा बभूव ।
भक्तिग्राह्यस्त्वमिह तदपि त्वामहं भक्तिमात्रात्
स्तोतुं वाञ्छाम्यतिमहदिदं साहसं मे सहस्व ॥१॥`,
    transliteration: `kaste boddhuṃ prabhavati paraṃ devadeva prabhāvaṃ
yasmāditthaṃ vividharachanā sṛuṣṭireṣā babhūva |
bhaktigrāhyastvamiha tadapi tvāmahaṃ bhaktimātrāt
stotuṃ vāñchāmyatimahadidaṃ sāhasaṃ me sahasva ||1||`,
    translation: `O Lord of lords, Who can know the extent of Your supreme glory, You from whom this multifarious creation has emerged! You are attainable only through devotion, and so I wish to praise You only out of devotion. Be so kind as to pardon this rashness on my part.`
  },
  {
    sanskrit: `नाधिष्ठातुं प्रभवति जडो नाप्यनीशश्च भावः
तस्मादाद्यस्त्वमसि जगतां नाथ जाने विधाता ।
क्षित्यादीनामवयववतां निश्चितं जन्म तावत्
तन्नास्त्येव क्वचन कलितं कर्त्रधिष्ठानहीनम् ॥२॥`,
    transliteration: `nādhiṣṭhātuṃ prabhavati jaḍo nāpyanīśaśca bhāvaḥ
tasmādādyastvamasiajagatāṃ nātha jāne vidhātā |
kṣityādīnāmavayavavatāṃ niścitaṃ janma tāvat
tannāstyeva kvacana kalitaṃ kartradhiṣṭhānahīnam ||2||`,
    translation: `The earth and other things which are made up of parts certainly have an origin. They are nowhere found to be without a creator and a material cause. Neither an inert object nor one who is powerless (like the jiva) is capable of creation. Therefore I know that You, Who alone existed before creation (Ādyaḥ), are the creator of the universe, O Lord.`
  },
  {
    sanskrit: `इन्द्रं मित्रं वरुणमनिलं पद्मजं विष्णुमीशं
प्राहुस्ते ते परमशिव ते मायया मोहितास्त्वाम् ।
एतैः सार्धं सकलमपि यच्छक्तिलेशे समाप्तं
स त्वं देवः श्रुतिषु विदितः शम्भुरित्यादिदेवः ॥३॥`,
    transliteration: `indraṃ mitraṃ varuṇamanilaṃ padmajaṃ viṣṇumīśaṃ
prāhuste te paramaśiva te māyayā mohitāstvām |
etaiḥ sārdhaṃ sakalamapi yaccaktiluśeṣe samāptaṃ
sa tvaṃ devaḥ śrutiṣu viditaḥ śambhurityādidevaḥ ||3||`,
    translation: `O Paramashiva! Deluded by Your māyā, people speak variously of Indra, Mitra, Varuṇa, Vāyu, Brahmā, Viṣṇu, as the cause of the universe. Everything, including these, is but a fraction of Your power. O Lord, You are known in the vedas as Śambhu, the supreme Lord.`
  },
  {
    sanskrit: `आनन्दाब्धेः किमपि च घनीभावमास्थाय रूपं
शक्त्या सार्धं परममुमया शाश्वतं भोगमिच्छन् ।
अध्वातीते शुचिदिवसकृत्कोटिदीप्रे कपर्दिन्
आद्ये स्थाने विहरसि सदा सेव्यमानो गणेशैः ॥४॥`,
    transliteration: `ānandābdheḥ kimapi ca ghanībhāvamāsthāya rūpaṃ
śaktyā sārdhaṃ paramamumayā śāśvataṃ bhogamiccan |
adhvātīte śucidivasakṛtkuṭidīpre kapardin
ādye sthāne viharasi sadā sevyamāno gaṇeśaiḥ ||4||`,
    translation: `Taking on an indescribable solidified form of the ocean of Bliss, desiring eternal supreme enjoyment with Your consort Umā, O Lord with matted hair, You ever sport in the primordial place, beyond the reach of speech and mind, which shines like a crore of suns and moons, served by the lords of the gaṇas.`
  },
  {
    sanskrit: `त्वं वेदान्तैर्विविधमहिमा गीयसे विश्वनेतः
त्वं विप्राद्यैर्वरद निखिलैरिज्यसे कर्मभिः स्वैः ।
त्वं दृष्टानुश्रविकविषयानन्दमात्रावितृष्णैः
अन्तर्ग्रन्थिप्रविलयकृते चिन्त्यसे योगिबृन्दैः ॥५॥`,
    transliteration: `tvaṃ vedāntairvividhamahimā gīyase viśvanetaḥ
tvaṃ viprādyairvarada nikhilairijyase karmabhiḥ svaiḥ |
tvaṃ dṛṣṭānuśravikaviṣayānandamātrāvitṛṣṇaiḥ
antargranthipravilayakṛte cintyase yogibṛndaiḥ ||5||`,
    translation: `O Lord of the Universe! Your innumerable glories are sung in the upaniṣads. O Bestower of boons, You are worshipped by Brahmanas and others by the performance of the rites assigned to them. You are meditated upon by yogis who have developed distaste for all enjoyments in this world and in other (higher) worlds, for the loosening of the internal knot (of bondage).`
  }
];

const aboutText = `Śrīmad Appayya Dīkṣita (1520-1593 CE) was one of the greatest exponents of Advaita Vedanta and a renowned Sanskrit scholar. This sublime hymn, also known as "Unmatta Pañcāśat," was composed in an intoxicated state of divine devotion to Lord Śiva.

The story goes that Appayya Dīkṣita once wanted to test the intensity of his devotion. He consumed a datura seed which produces intoxication and asked his disciples to write down all that he said during that state. This resulted in the beautiful Ātmārpaṇastuti - a profound expression of surrender and devotion to Paramaśiva.

In this work, he has praised Lord Śiva as the highest among the Trinity, while maintaining his position as an advaitin who makes no ultimate distinction between Śiva and Viṣṇu. The hymn exemplifies the perfect union of philosophical understanding and devotional fervor.`;

export default function AatmaarpanastutiPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-2 tracking-wide">
              आत्मार्पणस्तुतिः
            </h1>
            <h2 className="text-2xl md:text-3xl font-light mb-2">
              Ātmārpaṇastuti
            </h2>
            <p className="text-lg md:text-xl opacity-90 mb-4">
              श्रीमदप्पय्यदीक्षितेन्द्र विरचित
            </p>
            <p className="text-base md:text-lg opacity-80">
              A Hymn of Self-Surrender by Śrīmad Appayya Dīkṣitendra
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Audio Player Card */}
        <Card className="mb-8 border-orange-200 dark:border-orange-800 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900 dark:to-amber-900">
            <CardTitle className="flex items-center gap-3 text-orange-800 dark:text-orange-200">
              <Heart className="h-6 w-6" />
              Sacred Recitation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <audio
              ref={audioRef}
              src="/public-objects/aatmaarpanastuti.mp3"
              preload="metadata"
            />
            
            <div className="space-y-4">
              {/* Main controls */}
              <div className="flex items-center gap-4">
                <Button
                  onClick={togglePlayPause}
                  className="bg-orange-600 hover:bg-orange-700 text-white rounded-full p-3"
                  size="lg"
                >
                  {isPlaying ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6" />
                  )}
                </Button>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>/</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={toggleMute}
                    className="p-2"
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
                
                <Button variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* About Section */}
        <Card className="mb-8 border-amber-200 dark:border-amber-800">
          <CardHeader className="bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900 dark:to-yellow-900">
            <CardTitle className="text-amber-800 dark:text-amber-200">
              About Ātmārpaṇastuti
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="prose prose-amber dark:prose-invert max-w-none">
              {aboutText.split('\n\n').map((paragraph, index) => (
                <p key={index} className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300">
                  {paragraph}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sanskrit Verses */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-center text-orange-800 dark:text-orange-200 mb-8">
            संस्कृत श्लोकाः • Sanskrit Verses
          </h3>
          
          {verses.map((verse, index) => (
            <Card key={index} className="border-red-200 dark:border-red-800 shadow-md">
              <CardContent className="p-6">
                <div className="mb-4">
                  <span className="inline-block bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-3 py-1 rounded-full text-sm font-medium">
                    Verse {index + 1}
                  </span>
                </div>
                
                {/* Sanskrit */}
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-3">
                    संस्कृत • Sanskrit
                  </h4>
                  <div className="font-sanskrit text-lg leading-relaxed text-gray-800 dark:text-gray-200 bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                    {verse.sanskrit.split('\n').map((line, i) => (
                      <div key={i} className="mb-1">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Transliteration */}
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-3">
                    Transliteration
                  </h4>
                  <div className="font-mono text-base leading-relaxed text-gray-700 dark:text-gray-300 bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    {verse.transliteration.split('\n').map((line, i) => (
                      <div key={i} className="mb-1">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="my-4" />

                {/* Translation */}
                <div>
                  <h4 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-3">
                    Translation
                  </h4>
                  <div className="text-base leading-relaxed text-gray-700 dark:text-gray-300 bg-orange-50 dark:bg-orange-950 p-4 rounded-lg italic">
                    {verse.translation}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 py-8">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            ॐ नमः शिवाय • Oṃ Namaḥ Śivāya
          </p>
          <p className="text-gray-500 dark:text-gray-500 text-xs mt-2">
            May this sacred hymn bring peace and devotion to all beings
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #ea580c;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #ea580c;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .font-sanskrit {
          font-family: 'Noto Sans Devanagari', 'Siddhanta', sans-serif;
        }
      `
      }} />
    </div>
  );
}