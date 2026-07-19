"use client";

import { useState } from "react";
import type { Room } from "@/lib/types";
import type { RoomClassPin, RoomGender } from "@/lib/roomAutoAssign";
import { roomLabel, sortRooms } from "@/lib/roomLabel";

export interface RoomClassOption {
  classKey: string;
  label: string;
  gender: RoomGender;
  count: number;
}

export interface RoomExternalSettings {
  audioCount: number;
  audioGender: RoomGender | null;
  medicalCount: number;
  medicalGender: RoomGender | null;
  classPins: RoomClassPin[];
}

interface Props {
  roomCount: number;
  studentCount: number;
  adultCount: number;
  detectedAudioCount: number;
  detectedMedicalCount: number;
  classes: RoomClassOption[];
  rooms: Room[];
  onPreview: (settings: RoomExternalSettings) => void;
}

function GenderSelect({ value, onChange, disabled }: {
  value: RoomGender | null;
  onChange: (value: RoomGender | null) => void;
  disabled?: boolean;
}) {
  return (
    <select className="input text-sm" value={value ?? ""} disabled={disabled}
      onChange={event => onChange((event.target.value || null) as RoomGender | null)}>
      <option value="">성별 선택</option>
      <option value="남">남</option>
      <option value="여">여</option>
    </select>
  );
}

export default function RoomAutoAssignPanel({
  roomCount, studentCount, adultCount, detectedAudioCount, detectedMedicalCount, classes, rooms, onPreview,
}: Props) {
  const [open, setOpen] = useState(true);
  const [settings, setSettings] = useState<RoomExternalSettings>({
    audioCount: 3,
    audioGender: null,
    medicalCount: 1,
    medicalGender: null,
    classPins: [],
  });
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const missingAudio = Math.max(0, settings.audioCount - detectedAudioCount);
  const missingMedical = Math.max(0, settings.medicalCount - detectedMedicalCount);
  const canPreview = roomCount > 0
    && (missingAudio === 0 || settings.audioGender !== null)
    && (missingMedical === 0 || settings.medicalGender !== null);
  const pinnedClassKeys = new Set(settings.classPins.map(pin => pin.classKey));
  const pinnedRoomIds = new Set(settings.classPins.map(pin => pin.roomId));
  const classByKey = new Map(classes.map(item => [item.classKey, item]));
  const roomById = new Map(rooms.map(room => [room.id, room]));

  function addClassPin() {
    if (!selectedClassKey || !selectedRoomId || pinnedClassKeys.has(selectedClassKey) || pinnedRoomIds.has(selectedRoomId)) return;
    setSettings(prev => ({ ...prev, classPins: [...prev.classPins, { classKey: selectedClassKey, roomId: selectedRoomId }] }));
    setSelectedClassKey("");
    setSelectedRoomId("");
  }

  function removeClassPin(classKey: string) {
    setSettings(prev => ({ ...prev, classPins: prev.classPins.filter(pin => pin.classKey !== classKey) }));
  }

  return (
    <section className="card p-4 mb-4 border border-violet-100">
      <button type="button" className="w-full flex items-center justify-between text-left"
        onClick={() => setOpen(value => !value)}>
        <span>
          <span className="font-bold text-slate-800">🛏️ 자동 방배정</span>
          <span className="ml-2 text-xs text-slate-400">고정 규칙 · 30회 최적화</span>
        </span>
        <span className="text-xs text-slate-400">{open ? "▲ 접기" : "▼ 열기"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid lg:grid-cols-[1fr_22rem] gap-4">
            <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600 leading-6">
            <p className="font-semibold text-slate-700 mb-1">항상 적용되는 하드 규칙</p>
            <p>✓ 같은 반 학생끼리 배정, 반이 사용하는 모든 방은 같은 건물·같은 정원</p>
            <p>✓ 모든 반 담당 교사는 반드시 자기 반 학생이 있는 방에 함께 배정</p>
            <p>✓ 방 정원 초과 금지, 학생·교사·스탭·교역자·외부인원 전원 배정</p>
            <p>✓ 교역자 전용 방 · 음향 전용 방 · 의료 1인 전용 방</p>
            <p>✓ 선복귀·후발대 포함, 숙박하지 않는 당일참석과 신청취소 학생 제외</p>
            <p>✓ 학생·반 담당 교사의 방을 먼저 결정하고, 일반 교사·스탭은 남는 자리에만 배정</p>
            <p>✓ 30개 방 프로필 조합을 비교해 빈 침상과 사용 방이 가장 적은 유효 결과 선택</p>
            <p className="mt-2 text-slate-400">현재 대상: 방 {roomCount}개 · 학생 {studentCount}명 · 교사/스탭 {adultCount}명</p>
            </div>

            <div className="space-y-3">
            <div className="grid grid-cols-[1fr_5rem_7rem] gap-2 items-center">
              <label className="text-sm font-medium text-slate-700">외부 음향 총원</label>
              <input className="input text-sm" type="number" min={0} value={settings.audioCount}
                onChange={event => setSettings(prev => ({ ...prev, audioCount: Math.max(0, Number(event.target.value) || 0) }))} />
              <GenderSelect value={settings.audioGender} disabled={missingAudio === 0}
                onChange={audioGender => setSettings(prev => ({ ...prev, audioGender }))} />
            </div>
            <p className="text-[11px] text-slate-400 -mt-2">명단에서 {detectedAudioCount}명 감지 · 추가 외부인원 {missingAudio}명</p>
            <div className="grid grid-cols-[1fr_5rem_7rem] gap-2 items-center">
              <label className="text-sm font-medium text-slate-700">외부 의료 총원</label>
              <input className="input text-sm" type="number" min={0} value={settings.medicalCount}
                onChange={event => setSettings(prev => ({ ...prev, medicalCount: Math.max(0, Number(event.target.value) || 0) }))} />
              <GenderSelect value={settings.medicalGender} disabled={missingMedical === 0}
                onChange={medicalGender => setSettings(prev => ({ ...prev, medicalGender }))} />
            </div>
            <p className="text-[11px] text-slate-400 -mt-2">명단에서 {detectedMedicalCount}명 감지 · 추가 외부인원 {missingMedical}명</p>
            <button type="button" className="btn-primary w-full justify-center" disabled={!canPreview}
              onClick={() => onPreview(settings)}>
              🎲 30회 시뮬레이션 후 미리보기
            </button>
            {!canPreview && roomCount > 0 && (
              <p className="text-[11px] text-amber-600">추가할 외부인원의 성별을 먼저 선택해주세요.</p>
            )}
            </div>
          </div>

          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <label className="flex-1 text-xs font-medium text-slate-600">
                특정 반
                <select className="input text-sm mt-1" value={selectedClassKey}
                  onChange={event => setSelectedClassKey(event.target.value)}>
                  <option value="">반 선택</option>
                  {classes.filter(item => !pinnedClassKeys.has(item.classKey)).map(item => (
                    <option key={item.classKey} value={item.classKey}>{item.label} · {item.gender} · {item.count}명</option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-xs font-medium text-slate-600">
                기준 방
                <select className="input text-sm mt-1" value={selectedRoomId}
                  onChange={event => setSelectedRoomId(event.target.value)}>
                  <option value="">방 선택</option>
                  {sortRooms(rooms).filter(room => !pinnedRoomIds.has(room.id)).map(room => (
                    <option key={room.id} value={room.id}>{roomLabel(room)} · {room.type} · {room.capacity}인실</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn-secondary justify-center" disabled={!selectedClassKey || !selectedRoomId}
                onClick={addClassPin}>＋ 고정</button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              선택한 방을 해당 반의 기준 방으로 반드시 사용합니다. 정원을 넘으면 같은 건물·같은 정원의 방을 추가합니다.
            </p>
            {settings.classPins.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {settings.classPins.map(pin => (
                  <span key={pin.classKey} className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs text-violet-700">
                    {classByKey.get(pin.classKey)?.label ?? pin.classKey} → {roomById.get(pin.roomId) ? roomLabel(roomById.get(pin.roomId)!) : pin.roomId}
                    <button type="button" className="text-violet-400 hover:text-red-500" aria-label={`${pin.classKey} 고정 해제`}
                      onClick={() => removeClassPin(pin.classKey)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
